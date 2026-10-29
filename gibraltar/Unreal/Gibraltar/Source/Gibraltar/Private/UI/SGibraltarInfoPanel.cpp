// Gibraltar - landmark info panel.

#include "SGibraltarInfoPanel.h"
#include "GibraltarGeo.h"

#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Text/STextBlock.h"

void SGibraltarInfoPanel::Construct(const FArguments& InArgs)
{
	const FGibraltarInteractionInfo& Info = InArgs._Info;

	FString LocationLine;
	if (Info.bHasLocation)
	{
		LocationLine = FString::Printf(TEXT("%s   ·   %.1f m above sea level"),
			*FGibraltarGeo::FormatLonLat(Info.Longitude, Info.Latitude), Info.HeightM);
	}

	const FString Body = Info.Description.IsEmpty()
		? FString(TEXT("No description is available for this place yet."))
		: Info.Description;

	TSharedRef<SVerticalBox> Column = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(STextBlock)
			.Text(FText::FromString(Info.Title))
			.Font(FCoreStyle::GetDefaultFontStyle("Bold", 24))
			.ColorAndOpacity(FLinearColor(1.f, 0.95f, 0.85f, 1.f))
			.AutoWrapText(true)
		];

	if (!Info.Subtitle.IsEmpty())
	{
		Column->AddSlot().AutoHeight().Padding(FMargin(0.f, 2.f, 0.f, 0.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(Info.Subtitle))
			.Font(FCoreStyle::GetDefaultFontStyle("Italic", 12))
			.ColorAndOpacity(FLinearColor(0.85f, 0.65f, 0.25f, 1.f))
		];
	}

	Column->AddSlot().AutoHeight().Padding(FMargin(0.f, 10.f, 0.f, 10.f))
	[
		SNew(SBox).HeightOverride(2.f)
		[
			SNew(SImage).Image(&AccentBrush)
		]
	];

	Column->AddSlot().AutoHeight()
	[
		SNew(STextBlock)
		.Text(FText::FromString(Body))
		.Font(FCoreStyle::GetDefaultFontStyle("Regular", 14))
		.ColorAndOpacity(FLinearColor(0.92f, 0.92f, 0.92f, 1.f))
		.AutoWrapText(true)
	];

	if (!LocationLine.IsEmpty())
	{
		Column->AddSlot().AutoHeight().Padding(FMargin(0.f, 12.f, 0.f, 0.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(LocationLine))
			.Font(FCoreStyle::GetDefaultFontStyle("Mono", 11))
			.ColorAndOpacity(FLinearColor(0.7f, 0.8f, 0.9f, 1.f))
			.AutoWrapText(true)
		];
	}

	if (!Info.Source.IsEmpty())
	{
		Column->AddSlot().AutoHeight().Padding(FMargin(0.f, 6.f, 0.f, 0.f))
		[
			SNew(STextBlock)
			.Text(FText::FromString(Info.Source))
			.Font(FCoreStyle::GetDefaultFontStyle("Regular", 10))
			.ColorAndOpacity(FLinearColor(0.6f, 0.6f, 0.6f, 1.f))
			.AutoWrapText(true)
		];
	}

	Column->AddSlot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
	[
		SNew(STextBlock)
		.Text(FText::FromString(TEXT("[E] close")))
		.Font(FCoreStyle::GetDefaultFontStyle("Bold", 11))
		.ColorAndOpacity(FLinearColor(0.85f, 0.65f, 0.25f, 1.f))
	];

	ChildSlot
	.HAlign(HAlign_Right)
	.VAlign(VAlign_Center)
	.Padding(FMargin(0.f, 0.f, 48.f, 0.f))
	[
		SNew(SBox)
		.WidthOverride(480.f)
		[
			SNew(SBorder)
			.BorderImage(&PanelBrush)
			.Padding(FMargin(24.f, 20.f))
			[
				Column
			]
		]
	];

	// Purely informational: never steal the mouse.
	SetVisibility(EVisibility::SelfHitTestInvisible);
}
