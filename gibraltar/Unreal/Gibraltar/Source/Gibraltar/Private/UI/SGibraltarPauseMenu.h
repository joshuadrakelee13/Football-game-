// Gibraltar - pause menu with a settings page (Slate, no assets).

#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Brushes/SlateColorBrush.h"
#include "GibraltarTypes.h"

class AGibraltarPlayerController;
class SWidgetSwitcher;

class SGibraltarPauseMenu : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGibraltarPauseMenu) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AGibraltarPlayerController>, OwnerController)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;

private:
	TSharedRef<SWidget> BuildMainPage();
	TSharedRef<SWidget> BuildSettingsPage();

	TSharedRef<SWidget> MakeButton(const FText& Label, TFunction<void()> OnClick);
	TSharedRef<SWidget> MakeCyclerRow(const FText& Label, TFunction<FText()> GetValueText, TFunction<void(int32)> OnStep);
	TSharedRef<SWidget> MakeSliderRow(const FText& Label, float MinValue, float MaxValue, TFunction<float()> GetValue,
		TFunction<void(float)> SetValue, TFunction<FText()> GetValueText);
	TSharedRef<SWidget> MakeCheckRow(const FText& Label, TFunction<bool()> GetValue, TFunction<void(bool)> SetValue);

	void ShowPage(int32 PageIndex);
	void LoadWorkingSettings();
	void ApplyWorkingSettings();
	void SetStatus(const FText& Text);

	TWeakObjectPtr<AGibraltarPlayerController> OwnerController;
	TSharedPtr<SWidgetSwitcher> Switcher;
	FText StatusText;

	// Working copy edited by the settings page; written on "Apply".
	FGibraltarUserSettings Working;
	int32 WorkingScalability = 2;      // 0 Low, 1 Medium, 2 High, 3 Epic (-1 custom)
	float WorkingResolutionScale = 100.f;
	bool bWorkingVSync = true;
	int32 WorkingWindowMode = 1;       // EWindowMode: 0 Fullscreen, 1 WindowedFullscreen, 2 Windowed
	int32 WorkingTimeSpeedIndex = 3;   // index into the time-speed table (3 = x20)

	FSlateColorBrush BackdropBrush = FSlateColorBrush(FLinearColor(0.f, 0.f, 0.f, 0.55f));
	FSlateColorBrush PanelBrush = FSlateColorBrush(FLinearColor(0.02f, 0.03f, 0.05f, 0.92f));
};
