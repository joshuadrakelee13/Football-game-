// Gibraltar - landmark info panel (Slate, no assets).

#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Brushes/SlateColorBrush.h"
#include "GibraltarTypes.h"

class SGibraltarInfoPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGibraltarInfoPanel) {}
		SLATE_ARGUMENT(FGibraltarInteractionInfo, Info)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FSlateColorBrush PanelBrush = FSlateColorBrush(FLinearColor(0.02f, 0.03f, 0.05f, 0.82f));
	FSlateColorBrush AccentBrush = FSlateColorBrush(FLinearColor(0.85f, 0.65f, 0.25f, 1.f));
};
