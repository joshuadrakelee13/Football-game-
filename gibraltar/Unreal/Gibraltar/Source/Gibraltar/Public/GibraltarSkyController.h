// Gibraltar - real sun & moon, day/night cycle, sky and exposure.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GibraltarAstronomy.h"
#include "GibraltarSkyController.generated.h"

class USceneComponent;
class UPostProcessComponent;
class ADirectionalLight;
class ASkyLight;
class ASkyAtmosphere;
class AExponentialHeightFog;
class AVolumetricCloud;

/**
 * Drives the sky from the real solar/lunar position over Gibraltar
 * (lat 36.13 N, lon 5.35 W) for a simulated date and Europe/Gibraltar
 * clock time (CET/CEST with the EU summer-time rule).
 *
 * Finds the level's sky actors (DirectionalLight tagged "GibSun"/"GibMoon",
 * SkyAtmosphere, SkyLight, ExponentialHeightFog, VolumetricCloud) or spawns
 * them at runtime if missing. Unreal axes: X = east, Y = south, Z = up, so the
 * sun rises in +X and stands in +Y at noon.
 */
UCLASS()
class GIBRALTAR_API AGibraltarSkyController : public AActor
{
	GENERATED_BODY()

public:
	AGibraltarSkyController();

	// --- Time ------------------------------------------------------------------

	/** Start on today's date (Gibraltar calendar); otherwise use StartYear/Month/Day. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time")
	bool bUseTodaysDate = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time", meta = (EditCondition = "!bUseTodaysDate", ClampMin = "1900", ClampMax = "2200"))
	int32 StartYear = 2026;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time", meta = (EditCondition = "!bUseTodaysDate", ClampMin = "1", ClampMax = "12"))
	int32 StartMonth = 6;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time", meta = (EditCondition = "!bUseTodaysDate", ClampMin = "1", ClampMax = "31"))
	int32 StartDay = 21;

	/** Local Gibraltar clock time to start at (hours, e.g. 10.5 = 10:30). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time", meta = (ClampMin = "0", ClampMax = "24"))
	float StartLocalHour = 10.f;

	/** Game seconds per real second. Overridden by the player's settings at runtime. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time", meta = (ClampMin = "0"))
	float TimeSpeed = 20.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Time")
	bool bStartPaused = false;

	// --- Lighting --------------------------------------------------------------

	/** Sun illuminance at the top of the atmosphere (lux). The atmosphere dims/reddens it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float SunIlluminanceLux = 100000.f;

	/** Full-moon illuminance (lux). Real: ~0.3; slightly boosted for walkability. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float MoonIlluminanceLux = 0.4f;

	/** Minimum night light (sky glow / town light pollution), lux. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float NightFloorLux = 0.12f;

	/** Darkest scene auto-exposure adapts to (EV100). Higher = darker nights. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float MinExposureEV100 = -1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float MaxExposureEV100 = 16.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float DaytimeFogDensity = 0.006f;

	/** Re-aim the lights only when they moved more than this (saves shadow-cache invalidation). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	float MinLightAngleChangeDeg = 0.02f;

	/** Spawn SkyAtmosphere/SkyLight/fog/clouds/lights at runtime when the level has none. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gibraltar|Lighting")
	bool bSpawnMissingSkyActors = true;

	// --- API -------------------------------------------------------------------

	/** Editor button / script hook: aim the sun & moon for the start time without playing. */
	UFUNCTION(CallInEditor, BlueprintCallable, Category = "Gibraltar|Time")
	void ApplyTimeOfDayNow();

	void SetSimUtc(const FDateTime& NewUtc);
	FDateTime GetSimUtc() const { return SimUtc; }
	FDateTime GetLocalTime() const;
	bool IsSummerTime() const;

	void ShiftHours(double Hours);
	void SetTimePaused(bool bPaused) { bTimePaused = bPaused; }
	bool IsTimePaused() const { return bTimePaused; }
	void SetTimeSpeed(float NewSpeed) { TimeSpeed = FMath::Max(0.f, NewSpeed); }
	float GetTimeSpeed() const { return TimeSpeed; }

	double GetSunElevationDeg() const { return SunPosition.ElevationDeg; }
	double GetSunAzimuthDeg() const { return SunPosition.AzimuthDeg; }
	double GetMoonElevationDeg() const { return MoonPosition.ElevationDeg; }
	double GetMoonIlluminatedFraction() const { return MoonIllumination; }

	/** 0 at night, 1 in full daylight (smooth through twilight). */
	float GetDaylightFactor() const;

	/** "14:05 CEST, Sun 21 Jun 2026 (x20)". */
	FString GetTimeDescription() const;

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

protected:
	UPROPERTY(VisibleAnywhere, Category = "Gibraltar")
	TObjectPtr<USceneComponent> Root;

	/** Unbound post-process: physically based exposure range for day and night. */
	UPROPERTY(VisibleAnywhere, Category = "Gibraltar")
	TObjectPtr<UPostProcessComponent> Exposure;

private:
	void InitSimTime();
	void FindOrSpawnSkyActors(bool bAllowSpawn);
	void ConfigureSkyActors();
	void UpdateLighting(bool bForce);

	UPROPERTY(Transient) TObjectPtr<ADirectionalLight> SunActor;
	UPROPERTY(Transient) TObjectPtr<ADirectionalLight> MoonActor;
	UPROPERTY(Transient) TObjectPtr<ASkyLight> SkyLightActor;
	UPROPERTY(Transient) TObjectPtr<ASkyAtmosphere> AtmosphereActor;
	UPROPERTY(Transient) TObjectPtr<AExponentialHeightFog> FogActor;
	UPROPERTY(Transient) TObjectPtr<AVolumetricCloud> CloudActor;

	FDateTime SimUtc;
	bool bSimTimeInitialized = false;
	bool bTimePaused = false;

	FGibraltarSkyPosition SunPosition;
	FGibraltarSkyPosition MoonPosition;
	double MoonIllumination = 0.0;

	FVector LastSunDirection = FVector::ZeroVector;
	FVector LastMoonDirection = FVector::ZeroVector;
	float LastFogDensity = -1.f;
	int32 SunShadowState = -1;
	int32 MoonState = -1;
	bool bMoonUsesRealDirection = false;
};
