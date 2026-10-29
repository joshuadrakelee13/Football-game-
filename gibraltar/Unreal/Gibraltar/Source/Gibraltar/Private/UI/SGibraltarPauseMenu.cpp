// Gibraltar - pause menu with a settings page.

#include "SGibraltarPauseMenu.h"
#include "GibraltarGameInstance.h"
#include "GibraltarPlayerController.h"
#include "GibraltarSaveGame.h"

#include "Engine/Engine.h"
#include "GameFramework/GameUserSettings.h"
#include "InputCoreTypes.h"
#include "Input/Events.h"
#include "Input/Reply.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/Layout/SWidgetSwitcher.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Text/STextBlock.h"

namespace GibraltarMenu
{
	static const float TimeSpeeds[] = { 1.f, 5.f, 10.f, 20.f, 60.f, 120.f, 600.f };
	static constexpr int32 NumTimeSpeeds = UE_ARRAY_COUNT(TimeSpeeds);

	static const TCHAR* ScalabilityNames[] = { TEXT("Low"), TEXT("Medium"), TEXT("High"), TEXT("Epic") };
	static const TCHAR* WindowModeNames[] = { TEXT("Fullscreen"), TEXT("Borderless window"), TEXT("Windowed") };

	static FSlateFontInfo Font(int32 Size, const char* Face = "Regular")
	{
		return FCoreStyle::GetDefaultFontStyle(FName(Face), Size);
	}

	static int32 NearestTimeSpeedIndex(float Speed)
	{
		int32 Best = 3;
		float BestDiff = TNumericLimits<float>::Max();
		for (int32 I = 0; I < NumTimeSpeeds; ++I)
		{
			const float Diff = FMath::Abs(TimeSpeeds[I] - Speed);
			if (Diff < BestDiff)
			{
				BestDiff = Diff;
				Best = I;
			}
		}
		return Best;
	}
}

void SGibraltarPauseMenu::Construct(const FArguments& InArgs)
{
	OwnerController = InArgs._OwnerController;
	LoadWorkingSettings();

	ChildSlot
	[
		SNew(SOverlay)
		+ SOverlay::Slot()
		[
			SNew(SBorder)
			.BorderImage(&BackdropBrush)
		]
		+ SOverlay::Slot()
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(620.f)
			[
				SNew(SBorder)
				.BorderImage(&PanelBrush)
				.Padding(FMargin(32.f, 28.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SAssignNew(Switcher, SWidgetSwitcher)
						.WidgetIndex(0)
						+ SWidgetSwitcher::Slot()
						[
							BuildMainPage()
						]
						+ SWidgetSwitcher::Slot()
						[
							BuildSettingsPage()
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
					[
						SNew(STextBlock)
						.Text_Lambda([this]() { return StatusText; })
						.Font(GibraltarMenu::Font(12))
						.ColorAndOpacity(FLinearColor(0.85f, 0.65f, 0.25f, 1.f))
						.AutoWrapText(true)
					]
				]
			]
		]
	];
}

FReply SGibraltarPauseMenu::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	const FKey Key = InKeyEvent.GetKey();
	if (Key == EKeys::Escape || Key == EKeys::P)
	{
		if (Switcher.IsValid() && Switcher->GetActiveWidgetIndex() == 1)
		{
			ShowPage(0);
		}
		else if (AGibraltarPlayerController* PC = OwnerController.Get())
		{
			PC->ClosePauseMenu();
		}
		return FReply::Handled();
	}
	return SCompoundWidget::OnKeyDown(MyGeometry, InKeyEvent);
}

void SGibraltarPauseMenu::ShowPage(int32 PageIndex)
{
	if (PageIndex == 1)
	{
		LoadWorkingSettings();
	}
	SetStatus(FText::GetEmpty());
	if (Switcher.IsValid())
	{
		Switcher->SetActiveWidgetIndex(PageIndex);
	}
}

void SGibraltarPauseMenu::SetStatus(const FText& Text)
{
	StatusText = Text;
}

// ---------------------------------------------------------------------------
// Pages

TSharedRef<SWidget> SGibraltarPauseMenu::BuildMainPage()
{
	const FText Controls = FText::FromString(TEXT(
		"WASD walk  ·  Shift run  ·  Space jump  ·  C / Ctrl crouch\n"
		"E read about a place  ·  F3 location readout\n"
		"[ / ]  time -1 h / +1 h  ·  T pause time  ·  Esc / P this menu"));

	return SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 0.f, 0.f, 18.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(TEXT("Gibraltar")))
			.Font(GibraltarMenu::Font(32, "Bold"))
			.ColorAndOpacity(FLinearColor(1.f, 0.95f, 0.85f, 1.f))
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeButton(FText::FromString(TEXT("Resume")), [this]()
			{
				if (AGibraltarPlayerController* PC = OwnerController.Get())
				{
					PC->ClosePauseMenu();
				}
			})
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeButton(FText::FromString(TEXT("Settings")), [this]() { ShowPage(1); })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeButton(FText::FromString(TEXT("Save position")), [this]()
			{
				if (AGibraltarPlayerController* PC = OwnerController.Get())
				{
					const bool bOk = PC->SavePosition(GibraltarSaveSlots::Manual, false);
					SetStatus(FText::FromString(bOk ? TEXT("Position saved.") : TEXT("Could not save your position.")));
				}
			})
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeButton(FText::FromString(TEXT("Load position")), [this]()
			{
				if (AGibraltarPlayerController* PC = OwnerController.Get())
				{
					if (PC->LoadPosition(GibraltarSaveSlots::Manual, true))
					{
						PC->ClosePauseMenu();   // this widget is removed; don't touch members afterwards
					}
					else
					{
						SetStatus(FText::FromString(TEXT("There is no saved position yet.")));
					}
				}
			})
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeButton(FText::FromString(TEXT("Return to start")), [this]()
			{
				if (AGibraltarPlayerController* PC = OwnerController.Get())
				{
					PC->ReturnToStart();
					PC->ClosePauseMenu();
				}
			})
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeButton(FText::FromString(TEXT("Quit")), [this]()
			{
				if (AGibraltarPlayerController* PC = OwnerController.Get())
				{
					PC->QuitToDesktop();
				}
			})
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 18.f, 0.f, 0.f))
		[
			SNew(STextBlock)
			.Text(Controls)
			.Font(GibraltarMenu::Font(11))
			.ColorAndOpacity(FLinearColor(0.7f, 0.7f, 0.7f, 1.f))
			.AutoWrapText(true)
		];
}

TSharedRef<SWidget> SGibraltarPauseMenu::BuildSettingsPage()
{
	using namespace GibraltarMenu;

	return SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 0.f, 0.f, 14.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(TEXT("Settings")))
			.Font(Font(26, "Bold"))
			.ColorAndOpacity(FLinearColor(1.f, 0.95f, 0.85f, 1.f))
		]
		// --- Graphics (UGameUserSettings)
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeCyclerRow(FText::FromString(TEXT("Graphics quality")),
				[this]()
				{
					return FText::FromString(WorkingScalability >= 0 && WorkingScalability <= 3 ? ScalabilityNames[WorkingScalability] : TEXT("Custom"));
				},
				[this](int32 Dir)
				{
					const int32 Current = WorkingScalability < 0 ? 2 : WorkingScalability;
					WorkingScalability = (Current + Dir + 4) % 4;
				})
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeSliderRow(FText::FromString(TEXT("Resolution scale")), 50.f, 100.f,
				[this]() { return WorkingResolutionScale; },
				[this](float V) { WorkingResolutionScale = FMath::RoundToFloat(V); },
				[this]() { return FText::FromString(FString::Printf(TEXT("%d %%"), FMath::RoundToInt(WorkingResolutionScale))); })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeCheckRow(FText::FromString(TEXT("VSync")),
				[this]() { return bWorkingVSync; },
				[this](bool b) { bWorkingVSync = b; })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeCyclerRow(FText::FromString(TEXT("Window mode")),
				[this]() { return FText::FromString(WindowModeNames[FMath::Clamp(WorkingWindowMode, 0, 2)]); },
				[this](int32 Dir) { WorkingWindowMode = (WorkingWindowMode + Dir + 3) % 3; })
		]
		// --- Player (FGibraltarUserSettings)
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeSliderRow(FText::FromString(TEXT("Field of view")), 60.f, 120.f,
				[this]() { return Working.FieldOfView; },
				[this](float V) { Working.FieldOfView = FMath::RoundToFloat(V); },
				[this]() { return FText::FromString(FString::Printf(TEXT("%d°"), FMath::RoundToInt(Working.FieldOfView))); })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeSliderRow(FText::FromString(TEXT("Mouse sensitivity")), 0.1f, 4.f,
				[this]() { return Working.MouseSensitivity; },
				[this](float V) { Working.MouseSensitivity = V; },
				[this]() { return FText::FromString(FString::Printf(TEXT("%.2f"), Working.MouseSensitivity)); })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeCheckRow(FText::FromString(TEXT("Invert mouse Y")),
				[this]() { return Working.bInvertY; },
				[this](bool b) { Working.bInvertY = b; })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeSliderRow(FText::FromString(TEXT("Master volume")), 0.f, 1.f,
				[this]() { return Working.MasterVolume; },
				[this](float V) { Working.MasterVolume = V; },
				[this]() { return FText::FromString(FString::Printf(TEXT("%d %%"), FMath::RoundToInt(Working.MasterVolume * 100.f))); })
		]
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeCyclerRow(FText::FromString(TEXT("Time of day speed")),
				[this]()
				{
					const float Speed = TimeSpeeds[FMath::Clamp(WorkingTimeSpeedIndex, 0, NumTimeSpeeds - 1)];
					return FText::FromString(Speed <= 1.f ? FString(TEXT("Real time")) : FString::Printf(TEXT("x%d"), FMath::RoundToInt(Speed)));
				},
				[this](int32 Dir) { WorkingTimeSpeedIndex = FMath::Clamp(WorkingTimeSpeedIndex + Dir, 0, NumTimeSpeeds - 1); })
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 16.f, 0.f, 0.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(0.f, 0.f, 6.f, 0.f))
			[
				MakeButton(FText::FromString(TEXT("Apply")), [this]()
				{
					ApplyWorkingSettings();
					SetStatus(FText::FromString(TEXT("Settings applied and saved.")));
				})
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(6.f, 0.f, 0.f, 0.f))
			[
				MakeButton(FText::FromString(TEXT("Back")), [this]() { ShowPage(0); })
			]
		];
}

// ---------------------------------------------------------------------------
// Building blocks

TSharedRef<SWidget> SGibraltarPauseMenu::MakeButton(const FText& Label, TFunction<void()> OnClick)
{
	return SNew(SBox)
		.Padding(FMargin(0.f, 4.f))
		[
			SNew(SButton)
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			.ContentPadding(FMargin(16.f, 10.f))
			.OnClicked_Lambda([OnClick]()
			{
				if (OnClick)
				{
					OnClick();
				}
				return FReply::Handled();
			})
			[
				SNew(STextBlock)
				.Text(Label)
				.Font(GibraltarMenu::Font(16, "Bold"))
			]
		];
}

TSharedRef<SWidget> SGibraltarPauseMenu::MakeCyclerRow(const FText& Label, TFunction<FText()> GetValueText, TFunction<void(int32)> OnStep)
{
	return SNew(SBox)
		.Padding(FMargin(0.f, 3.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.45f).VAlign(VAlign_Center)
			[
				SNew(STextBlock).Text(Label).Font(GibraltarMenu::Font(14))
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
			[
				SNew(SButton)
				.ContentPadding(FMargin(10.f, 2.f))
				.OnClicked_Lambda([OnStep]() { if (OnStep) { OnStep(-1); } return FReply::Handled(); })
				[
					SNew(STextBlock).Text(FText::FromString(TEXT("<"))).Font(GibraltarMenu::Font(14, "Bold"))
				]
			]
			+ SHorizontalBox::Slot().FillWidth(0.45f).HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(STextBlock)
				.Text_Lambda([GetValueText]() { return GetValueText ? GetValueText() : FText::GetEmpty(); })
				.Font(GibraltarMenu::Font(14))
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
			[
				SNew(SButton)
				.ContentPadding(FMargin(10.f, 2.f))
				.OnClicked_Lambda([OnStep]() { if (OnStep) { OnStep(1); } return FReply::Handled(); })
				[
					SNew(STextBlock).Text(FText::FromString(TEXT(">"))).Font(GibraltarMenu::Font(14, "Bold"))
				]
			]
		];
}

TSharedRef<SWidget> SGibraltarPauseMenu::MakeSliderRow(const FText& Label, float MinValue, float MaxValue, TFunction<float()> GetValue,
	TFunction<void(float)> SetValue, TFunction<FText()> GetValueText)
{
	return SNew(SBox)
		.Padding(FMargin(0.f, 3.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.45f).VAlign(VAlign_Center)
			[
				SNew(STextBlock).Text(Label).Font(GibraltarMenu::Font(14))
			]
			+ SHorizontalBox::Slot().FillWidth(0.4f).VAlign(VAlign_Center)
			[
				SNew(SSlider)
				.MinValue(MinValue)
				.MaxValue(MaxValue)
				.Value_Lambda([GetValue]() { return GetValue ? GetValue() : 0.f; })
				.OnValueChanged_Lambda([SetValue](float NewValue) { if (SetValue) { SetValue(NewValue); } })
			]
			+ SHorizontalBox::Slot().FillWidth(0.15f).HAlign(HAlign_Right).VAlign(VAlign_Center)
			[
				SNew(STextBlock)
				.Text_Lambda([GetValueText]() { return GetValueText ? GetValueText() : FText::GetEmpty(); })
				.Font(GibraltarMenu::Font(13))
			]
		];
}

TSharedRef<SWidget> SGibraltarPauseMenu::MakeCheckRow(const FText& Label, TFunction<bool()> GetValue, TFunction<void(bool)> SetValue)
{
	return SNew(SBox)
		.Padding(FMargin(0.f, 3.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.45f).VAlign(VAlign_Center)
			[
				SNew(STextBlock).Text(Label).Font(GibraltarMenu::Font(14))
			]
			+ SHorizontalBox::Slot().FillWidth(0.55f).VAlign(VAlign_Center)
			[
				SNew(SCheckBox)
				.IsChecked_Lambda([GetValue]() { return (GetValue && GetValue()) ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
				.OnCheckStateChanged_Lambda([SetValue](ECheckBoxState State) { if (SetValue) { SetValue(State == ECheckBoxState::Checked); } })
			]
		];
}

// ---------------------------------------------------------------------------
// Settings plumbing

void SGibraltarPauseMenu::LoadWorkingSettings()
{
	if (const AGibraltarPlayerController* PC = OwnerController.Get())
	{
		if (const UGibraltarGameInstance* GI = PC->GetGibraltarGameInstance())
		{
			Working = GI->GetUserSettings();
		}
	}
	WorkingTimeSpeedIndex = GibraltarMenu::NearestTimeSpeedIndex(Working.TimeSpeed);

	if (UGameUserSettings* GUS = GEngine ? GEngine->GetGameUserSettings() : nullptr)
	{
		WorkingScalability = GUS->GetOverallScalabilityLevel();
		if (WorkingScalability > 3)
		{
			WorkingScalability = 3;   // Cinematic shown as Epic
		}

		float Normalized = 1.f, Value = 100.f, MinValue = 0.f, MaxValue = 100.f;
		GUS->GetResolutionScaleInformationEx(Normalized, Value, MinValue, MaxValue);
		WorkingResolutionScale = FMath::Clamp(Value, 50.f, 100.f);

		bWorkingVSync = GUS->IsVSyncEnabled();
		WorkingWindowMode = FMath::Clamp(static_cast<int32>(GUS->GetFullscreenMode()), 0, 2);
	}
}

void SGibraltarPauseMenu::ApplyWorkingSettings()
{
	if (UGameUserSettings* GUS = GEngine ? GEngine->GetGameUserSettings() : nullptr)
	{
		if (WorkingScalability >= 0)
		{
			GUS->SetOverallScalabilityLevel(WorkingScalability);
		}
		GUS->SetResolutionScaleValueEx(WorkingResolutionScale);
		GUS->SetVSyncEnabled(bWorkingVSync);

		const EWindowMode::Type NewMode = static_cast<EWindowMode::Type>(FMath::Clamp(WorkingWindowMode, 0, 2));
		if (NewMode != GUS->GetFullscreenMode())
		{
			const FIntPoint Desktop = GUS->GetDesktopResolution();
			GUS->SetFullscreenMode(NewMode);
			if (NewMode == EWindowMode::Windowed)
			{
				if (GUS->GetScreenResolution() == Desktop)
				{
					GUS->SetScreenResolution(FIntPoint(Desktop.X * 3 / 4, Desktop.Y * 3 / 4));
				}
			}
			else
			{
				GUS->SetScreenResolution(Desktop);
			}
		}

		// Applies resolution, window mode and scalability, and writes GameUserSettings.ini.
		GUS->ApplySettings(false);
	}

	Working.TimeSpeed = GibraltarMenu::TimeSpeeds[FMath::Clamp(WorkingTimeSpeedIndex, 0, GibraltarMenu::NumTimeSpeeds - 1)];

	if (AGibraltarPlayerController* PC = OwnerController.Get())
	{
		if (UGibraltarGameInstance* GI = PC->GetGibraltarGameInstance())
		{
			GI->SetUserSettings(Working, /*bPersist*/ true);
		}
	}
}
