// Gibraltar - ambient sound beds (sea, wind, birds by day, crickets by night).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GibraltarAmbienceManager.generated.h"

class UAudioComponent;
class USceneComponent;
class USoundBase;
class AGibraltarSkyController;

/**
 * Four looping 2D beds whose volumes follow the listener:
 *  - sea:      how much open water there is around you (downward traces in
 *              rings of 40/120/300 m; no hit or a hit below +1.5 m = sea),
 *              quieter the higher you climb;
 *  - wind:     grows with height above sea level (strong on the Upper Rock);
 *  - birds:    daytime (sun elevation from AGibraltarSkyController);
 *  - crickets: night-time, away from the open sea.
 * Missing sound assets are logged once and skipped.
 */
UCLASS()
class GIBRALTAR_API AGibraltarAmbienceManager : public AActor
{
	GENERATED_BODY()

public:
	AGibraltarAmbienceManager();

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience")
	TSoftObjectPtr<USoundBase> SeaSound;

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience")
	TSoftObjectPtr<USoundBase> WindSound;

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience")
	TSoftObjectPtr<USoundBase> BirdsSound;

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience")
	TSoftObjectPtr<USoundBase> CricketsSound;

	/** Per-bed loudness at full intensity (before master volume). */
	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience", meta = (ClampMin = "0", ClampMax = "2"))
	float SeaVolume = 0.9f;

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience", meta = (ClampMin = "0", ClampMax = "2"))
	float WindVolume = 0.6f;

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience", meta = (ClampMin = "0", ClampMax = "2"))
	float BirdsVolume = 0.5f;

	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience", meta = (ClampMin = "0", ClampMax = "2"))
	float CricketsVolume = 0.45f;

	/** Seconds between environment probes. */
	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience")
	float ProbeInterval = 0.25f;

	/** Height of the summit used to normalise height effects (m). */
	UPROPERTY(EditAnywhere, Category = "Gibraltar|Ambience")
	float RockHeightM = 420.f;

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

protected:
	UPROPERTY(VisibleAnywhere, Category = "Gibraltar")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Gibraltar") TObjectPtr<UAudioComponent> SeaAudio;
	UPROPERTY(VisibleAnywhere, Category = "Gibraltar") TObjectPtr<UAudioComponent> WindAudio;
	UPROPERTY(VisibleAnywhere, Category = "Gibraltar") TObjectPtr<UAudioComponent> BirdsAudio;
	UPROPERTY(VisibleAnywhere, Category = "Gibraltar") TObjectPtr<UAudioComponent> CricketsAudio;

private:
	UAudioComponent* MakeBed(const TCHAR* Name);
	bool StartBed(UAudioComponent* Audio, const TSoftObjectPtr<USoundBase>& Sound, const TCHAR* Label);
	void Probe();
	float MeasureSeaFraction(const FVector& ListenerLocation) const;

	UFUNCTION()
	void HandleAudioFinished();

	TWeakObjectPtr<AGibraltarSkyController> SkyController;

	float ProbeTimer = 0.f;
	float TargetSea = 0.f, TargetWind = 0.f, TargetBirds = 0.f, TargetCrickets = 0.f;
	float CurrentSea = 0.f, CurrentWind = 0.f, CurrentBirds = 0.f, CurrentCrickets = 0.f;
};
