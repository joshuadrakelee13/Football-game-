// Gibraltar - shared plain data types.

#pragma once

#include "CoreMinimal.h"
#include "GibraltarTypes.generated.h"

/** What an interactable thing shows on the HUD prompt and in the info panel. */
USTRUCT(BlueprintType)
struct GIBRALTAR_API FGibraltarInteractionInfo
{
	GENERATED_BODY()

	/** Main heading, e.g. "Moorish Castle". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	FString Title;

	/** Secondary line, e.g. the OSM kind "historic=castle". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	FString Subtitle;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	FString Description;

	/** Data source / attribution line. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	FString Source;

	/** Verb shown in the prompt: "[E] <PromptVerb> <Title>". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	FString PromptVerb = TEXT("Read about");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	bool bHasLocation = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	double Longitude = 0.0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	double Latitude = 0.0;

	/** Height above mean sea level, metres. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	double HeightM = 0.0;
};

/**
 * Non-graphics player preferences. Graphics options (scalability, resolution
 * scale, VSync, window mode) live in UGameUserSettings instead.
 */
USTRUCT(BlueprintType)
struct GIBRALTAR_API FGibraltarUserSettings
{
	GENERATED_BODY()

	/** Horizontal field of view in degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	float FieldOfView = 90.f;

	/** Multiplier on mouse look speed. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	float MouseSensitivity = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	bool bInvertY = false;

	/** 0..1, applied to all game audio (the ambience). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	float MasterVolume = 0.8f;

	/** Game seconds per real second (20 = one game day in 72 real minutes). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	float TimeSpeed = 20.f;

	/** F3 location readout visible. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar")
	bool bShowLocation = false;

	/** Clamp everything to sane ranges (old or hand-edited saves). */
	void Sanitize()
	{
		FieldOfView = FMath::Clamp(FieldOfView, 60.f, 120.f);
		MouseSensitivity = FMath::Clamp(MouseSensitivity, 0.05f, 5.f);
		MasterVolume = FMath::Clamp(MasterVolume, 0.f, 1.f);
		TimeSpeed = FMath::Clamp(TimeSpeed, 0.f, 3600.f);
	}
};
