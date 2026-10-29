// Gibraltar - save data (player position, time of day, settings).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "GibraltarTypes.h"
#include "GibraltarSaveGame.generated.h"

namespace GibraltarSaveSlots
{
	/** Written every 60 s and on quit; restored on start. */
	static const TCHAR* const Autosave = TEXT("Gibraltar_Autosave");
	/** Pause menu "Save position" / "Load position". */
	static const TCHAR* const Manual = TEXT("Gibraltar_Manual");
	/** Non-graphics preferences only (so they survive "Return to start"). */
	static const TCHAR* const Settings = TEXT("Gibraltar_Settings");
	static constexpr int32 UserIndex = 0;
}

UCLASS()
class GIBRALTAR_API UGibraltarSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	static constexpr int32 CurrentVersion = 1;

	UPROPERTY()
	int32 SaveVersion = CurrentVersion;

	UPROPERTY()
	FDateTime SavedAtUtc;

	// --- Player -------------------------------------------------------------

	UPROPERTY()
	bool bHasPlayer = false;

	/** Pawn (capsule centre) location in Unreal world cm. */
	UPROPERTY()
	FVector PlayerLocation = FVector::ZeroVector;

	/** Control (view) rotation. */
	UPROPERTY()
	FRotator PlayerRotation = FRotator::ZeroRotator;

	/** Same position as geographic coordinates, robust against engine-side changes. */
	UPROPERTY()
	double Longitude = 0.0;

	UPROPERTY()
	double Latitude = 0.0;

	/** Capsule centre height above mean sea level, metres. */
	UPROPERTY()
	double HeightM = 0.0;

	UPROPERTY()
	bool bWasCrouched = false;

	// --- World time ---------------------------------------------------------

	UPROPERTY()
	bool bHasTime = false;

	/** Simulated UTC instant as FDateTime ticks. */
	UPROPERTY()
	int64 SimUtcTicks = 0;

	/** Local Gibraltar clock hour 0..24 (informational). */
	UPROPERTY()
	float LocalHourOfDay = 0.f;

	UPROPERTY()
	bool bTimePaused = false;

	// --- Settings -----------------------------------------------------------

	UPROPERTY()
	bool bHasSettings = false;

	UPROPERTY()
	FGibraltarUserSettings Settings;
};
