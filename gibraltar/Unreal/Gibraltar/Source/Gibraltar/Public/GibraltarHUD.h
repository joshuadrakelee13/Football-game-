// Gibraltar - HUD drawn on the canvas: crosshair, interaction prompt, messages, F3 readout.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "GibraltarHUD.generated.h"

class UFont;

UCLASS()
class GIBRALTAR_API AGibraltarHUD : public AHUD
{
	GENERATED_BODY()

public:
	AGibraltarHUD();

	virtual void DrawHUD() override;

private:
	void DrawCrosshair(float CenterX, float CenterY, float Scale, bool bHighlighted);
	void DrawPrompt(float CenterX, float CenterY, float Scale);
	void DrawToast(float Scale);
	void DrawLocationReadout(float Scale);

	/** Text with a 1 px drop shadow; returns the drawn height. Handles '\n'. */
	float DrawShadowedText(const FString& Text, float X, float Y, const FLinearColor& Color, UFont* Font, float Scale, bool bCentered);
};
