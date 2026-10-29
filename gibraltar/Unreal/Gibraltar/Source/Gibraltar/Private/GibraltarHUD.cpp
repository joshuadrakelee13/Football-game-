// Gibraltar - HUD.

#include "GibraltarHUD.h"
#include "GibraltarCharacter.h"
#include "GibraltarGeo.h"
#include "GibraltarPlayerController.h"
#include "GibraltarSkyController.h"
#include "GibraltarTypes.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"

AGibraltarHUD::AGibraltarHUD()
{
}

float AGibraltarHUD::DrawShadowedText(const FString& Text, float X, float Y, const FLinearColor& Color, UFont* Font, float Scale, bool bCentered)
{
	TArray<FString> Lines;
	Text.ParseIntoArray(Lines, TEXT("\n"), false);

	float CursorY = Y;
	for (const FString& Line : Lines)
	{
		float W = 0.f, H = 0.f;
		GetTextSize(Line.IsEmpty() ? FString(TEXT(" ")) : Line, W, H, Font, Scale);
		const float LineX = bCentered ? X - W * 0.5f : X;
		DrawText(Line, FLinearColor(0.f, 0.f, 0.f, Color.A * 0.8f), LineX + 1.f, CursorY + 1.f, Font, Scale);
		DrawText(Line, Color, LineX, CursorY, Font, Scale);
		CursorY += H;
	}
	return CursorY - Y;
}

void AGibraltarHUD::DrawHUD()
{
	Super::DrawHUD();

	if (!Canvas)
	{
		return;
	}

	const AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(PlayerOwner);
	if (PC && PC->IsPauseMenuOpen())
	{
		DrawToast(FMath::Max(0.6f, Canvas->ClipY / 1080.f));
		return;
	}

	const float Scale = FMath::Max(0.6f, Canvas->ClipY / 1080.f);
	const float CenterX = Canvas->ClipX * 0.5f;
	const float CenterY = Canvas->ClipY * 0.5f;

	bool bHasFocus = false;
	if (const AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(GetOwningPawn()))
	{
		FGibraltarInteractionInfo Dummy;
		bHasFocus = Walker->GetFocusedInteraction(Dummy);
	}

	DrawCrosshair(CenterX, CenterY, Scale, bHasFocus);
	DrawPrompt(CenterX, CenterY, Scale);
	DrawToast(Scale);

	if (PC && PC->IsLocationReadoutVisible())
	{
		DrawLocationReadout(Scale);
	}
}

void AGibraltarHUD::DrawCrosshair(float CenterX, float CenterY, float Scale, bool bHighlighted)
{
	const float Size = (bHighlighted ? 4.f : 2.f) * Scale;
	const FLinearColor Color = bHighlighted ? FLinearColor(1.f, 0.8f, 0.35f, 0.95f) : FLinearColor(1.f, 1.f, 1.f, 0.6f);
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.4f), CenterX - Size - 1.f, CenterY - Size - 1.f, Size * 2.f + 2.f, Size * 2.f + 2.f);
	DrawRect(Color, CenterX - Size, CenterY - Size, Size * 2.f, Size * 2.f);
}

void AGibraltarHUD::DrawPrompt(float CenterX, float CenterY, float Scale)
{
	const AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(PlayerOwner);
	const AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(GetOwningPawn());
	if (!PC || !Walker || PC->IsInfoPanelOpen())
	{
		return;
	}

	FGibraltarInteractionInfo Info;
	if (!Walker->GetFocusedInteraction(Info))
	{
		return;
	}

	const FString Prompt = FString::Printf(TEXT("[E]  %s  %s"), *Info.PromptVerb, *Info.Title);
	DrawShadowedText(Prompt, CenterX, CenterY + 28.f * Scale, FLinearColor(1.f, 0.95f, 0.85f, 1.f), GEngine->GetMediumFont(), Scale, true);
}

void AGibraltarHUD::DrawToast(float Scale)
{
	const AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(PlayerOwner);
	if (!PC)
	{
		return;
	}
	FText Message;
	float Opacity = 0.f;
	if (PC->GetToast(Message, Opacity) && Opacity > 0.f)
	{
		DrawShadowedText(Message.ToString(), Canvas->ClipX * 0.5f, 60.f * Scale, FLinearColor(1.f, 1.f, 1.f, Opacity), GEngine->GetMediumFont(), Scale, true);
	}
}

void AGibraltarHUD::DrawLocationReadout(float Scale)
{
	APawn* PawnOwner = GetOwningPawn();
	AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(PlayerOwner);
	if (!PawnOwner || !PC)
	{
		return;
	}

	const FVector UeLocation = PawnOwner->GetActorLocation();
	const FVector Ltm = FGibraltarGeo::UnrealToLtm(UeLocation);
	double Lon = 0.0, Lat = 0.0;
	FGibraltarGeo::LtmToLonLat(Ltm.X, Ltm.Y, Lon, Lat);
	const FIntPoint Tile = FGibraltarGeo::TileIndexForLtm(Ltm.X, Ltm.Y);

	double FeetM = Ltm.Z;
	double EyeM = Ltm.Z;
	if (const AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(PawnOwner))
	{
		FeetM = Walker->GetFeetHeightM();
		EyeM = Walker->GetEyeHeightM();
	}

	const double Heading = FGibraltarGeo::YawToCompassHeading(PC->GetControlRotation().Yaw);

	FString Text;
	Text += FString::Printf(TEXT("GIB-LTM   x %9.2f m   y %9.2f m\n"), Ltm.X, Ltm.Y);
	Text += FString::Printf(TEXT("WGS84     %s\n"), *FGibraltarGeo::FormatLonLat(Lon, Lat));
	Text += FString::Printf(TEXT("          lon %.6f   lat %.6f\n"), Lon, Lat);
	Text += FString::Printf(TEXT("Height    %.1f m above sea level (eye %.1f m)\n"), FeetM, EyeM);
	Text += FString::Printf(TEXT("Heading   %03.0f° %s\n"), Heading, FGibraltarGeo::CompassPoint(Heading));
	Text += FString::Printf(TEXT("Tile      %s  (%d, %d)\n"), *FGibraltarGeo::TileId(Tile.X, Tile.Y), Tile.X, Tile.Y);
	Text += FString::Printf(TEXT("Unreal    %.0f, %.0f, %.0f cm\n"), UeLocation.X, UeLocation.Y, UeLocation.Z);

	if (AGibraltarSkyController* Sky = PC->GetSkyController())
	{
		Text += FString::Printf(TEXT("Time      %s\n"), *Sky->GetTimeDescription());
		Text += FString::Printf(TEXT("Sun       elevation %.1f°  azimuth %.1f°\n"), Sky->GetSunElevationDeg(), Sky->GetSunAzimuthDeg());
	}
	Text += TEXT("F3 hide");

	UFont* Font = GEngine->GetSmallFont();
	float W = 0.f, H = 0.f;
	GetTextSize(TEXT("Height    0000.0 m above sea level (eye 0000.0 m) ++++++"), W, H, Font, Scale);
	TArray<FString> Lines;
	Text.ParseIntoArray(Lines, TEXT("\n"), false);

	const float Pad = 10.f * Scale;
	const float X = 16.f * Scale;
	const float Y = 16.f * Scale;
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.5f), X - Pad, Y - Pad, W + Pad * 2.f, H * Lines.Num() + Pad * 2.f);
	DrawShadowedText(Text, X, Y, FLinearColor(0.85f, 0.95f, 1.f, 1.f), Font, Scale, false);
}
