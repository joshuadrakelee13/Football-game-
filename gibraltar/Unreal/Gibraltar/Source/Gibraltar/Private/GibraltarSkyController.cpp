// Gibraltar - real sun & moon, day/night cycle, sky and exposure.

#include "GibraltarSkyController.h"
#include "Gibraltar.h"
#include "GibraltarGeo.h"

#include "Components/SceneComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/World.h"
#include "EngineUtils.h"

namespace
{
	const FName SunTag(TEXT("GibSun"));
	const FName MoonTag(TEXT("GibMoon"));

	/** Night-light direction while the real moon is below the horizon (a soft glow from the south-west). */
	const FGibraltarSkyPosition NightGlowPosition = { 55.0, 200.0 };

	float SkySmoothStep(float Edge0, float Edge1, float X)
	{
		const float T = FMath::Clamp((X - Edge0) / (Edge1 - Edge0), 0.f, 1.f);
		return T * T * (3.f - 2.f * T);
	}

	template <typename T>
	T* SpawnSkyActor(UWorld* World, const FName& Tag, TFunctionRef<void(T*)> BeforeFinish)
	{
		T* Actor = World->SpawnActorDeferred<T>(T::StaticClass(), FTransform::Identity, nullptr, nullptr,
			ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
		if (!Actor)
		{
			return nullptr;
		}
		if (!Tag.IsNone())
		{
			Actor->Tags.AddUnique(Tag);
		}
		BeforeFinish(Actor);
		Actor->FinishSpawning(FTransform::Identity);
		return Actor;
	}

	void MarkForEditorSave(AActor* Actor)
	{
		// When previewing in the editor, make sure the change is saved with the level.
		if (Actor && Actor->GetWorld() && !Actor->GetWorld()->IsGameWorld())
		{
			Actor->Modify();
		}
	}
}

AGibraltarSkyController::AGibraltarSkyController()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Exposure = CreateDefaultSubobject<UPostProcessComponent>(TEXT("Exposure"));
	Exposure->SetupAttachment(Root);
	Exposure->bUnbound = true;
	Exposure->Priority = -10.f;   // any hand-placed post-process volume wins
	FPostProcessSettings& S = Exposure->Settings;
	S.bOverride_AutoExposureMethod = true;
	S.AutoExposureMethod = EAutoExposureMethod::AEM_Histogram;
	S.bOverride_AutoExposureMinBrightness = true;
	S.AutoExposureMinBrightness = MinExposureEV100;
	S.bOverride_AutoExposureMaxBrightness = true;
	S.AutoExposureMaxBrightness = MaxExposureEV100;
	S.bOverride_AutoExposureSpeedUp = true;
	S.AutoExposureSpeedUp = 2.f;
	S.bOverride_AutoExposureSpeedDown = true;
	S.AutoExposureSpeedDown = 1.f;
}

// ---------------------------------------------------------------------------
// Time

void AGibraltarSkyController::InitSimTime()
{
	FDateTime LocalMidnight;
	if (bUseTodaysDate)
	{
		const FDateTime LocalNow = FGibraltarAstronomy::UtcToGibraltarLocal(FDateTime::UtcNow());
		LocalMidnight = FDateTime(LocalNow.GetYear(), LocalNow.GetMonth(), LocalNow.GetDay());
	}
	else if (FDateTime::Validate(StartYear, StartMonth, StartDay, 0, 0, 0, 0))
	{
		LocalMidnight = FDateTime(StartYear, StartMonth, StartDay);
	}
	else
	{
		UE_LOG(LogGibraltar, Warning, TEXT("Invalid start date %d-%d-%d; using 21 June 2026."), StartYear, StartMonth, StartDay);
		LocalMidnight = FDateTime(2026, 6, 21);
	}

	const FDateTime Local = LocalMidnight + FTimespan::FromHours(FMath::Clamp(StartLocalHour, 0.f, 24.f));
	SimUtc = FGibraltarAstronomy::GibraltarLocalToUtc(Local);
	bSimTimeInitialized = true;
}

void AGibraltarSkyController::SetSimUtc(const FDateTime& NewUtc)
{
	SimUtc = NewUtc;
	bSimTimeInitialized = true;
	UpdateLighting(true);
}

FDateTime AGibraltarSkyController::GetLocalTime() const
{
	return FGibraltarAstronomy::UtcToGibraltarLocal(SimUtc);
}

bool AGibraltarSkyController::IsSummerTime() const
{
	return FGibraltarAstronomy::IsEuSummerTime(SimUtc);
}

void AGibraltarSkyController::ShiftHours(double Hours)
{
	SimUtc += FTimespan::FromHours(Hours);
	UpdateLighting(true);
}

float AGibraltarSkyController::GetDaylightFactor() const
{
	return SkySmoothStep(-6.f, 6.f, static_cast<float>(SunPosition.ElevationDeg));
}

FString AGibraltarSkyController::GetTimeDescription() const
{
	static const TCHAR* Days[7] = { TEXT("Mon"), TEXT("Tue"), TEXT("Wed"), TEXT("Thu"), TEXT("Fri"), TEXT("Sat"), TEXT("Sun") };
	static const TCHAR* Months[12] = { TEXT("Jan"), TEXT("Feb"), TEXT("Mar"), TEXT("Apr"), TEXT("May"), TEXT("Jun"),
		TEXT("Jul"), TEXT("Aug"), TEXT("Sep"), TEXT("Oct"), TEXT("Nov"), TEXT("Dec") };

	const FDateTime Local = GetLocalTime();
	const int32 DayIndex = FMath::Clamp(static_cast<int32>(Local.GetDayOfWeek()), 0, 6);
	const int32 MonthIndex = FMath::Clamp(Local.GetMonth() - 1, 0, 11);

	FString Speed;
	if (bTimePaused)
	{
		Speed = TEXT("time paused");
	}
	else if (TimeSpeed <= 1.01f)
	{
		Speed = TEXT("real time");
	}
	else
	{
		Speed = FString::Printf(TEXT("x%d"), FMath::RoundToInt(TimeSpeed));
	}

	return FString::Printf(TEXT("%02d:%02d %s, %s %d %s %d (%s)"),
		Local.GetHour(), Local.GetMinute(), IsSummerTime() ? TEXT("CEST") : TEXT("CET"),
		Days[DayIndex], Local.GetDay(), Months[MonthIndex], Local.GetYear(), *Speed);
}

// ---------------------------------------------------------------------------
// Sky actors

void AGibraltarSkyController::FindOrSpawnSkyActors(bool bAllowSpawn)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Directional lights: tagged ones first, otherwise the first untagged light is the sun.
	ADirectionalLight* UntaggedLight = nullptr;
	for (TActorIterator<ADirectionalLight> It(World); It; ++It)
	{
		ADirectionalLight* Light = *It;
		if (Light->ActorHasTag(SunTag) && !SunActor)
		{
			SunActor = Light;
		}
		else if (Light->ActorHasTag(MoonTag) && !MoonActor)
		{
			MoonActor = Light;
		}
		else if (!UntaggedLight && !Light->ActorHasTag(SunTag) && !Light->ActorHasTag(MoonTag))
		{
			UntaggedLight = Light;
		}
	}
	if (!SunActor && UntaggedLight)
	{
		SunActor = UntaggedLight;
	}

	if (!SkyLightActor)
	{
		for (TActorIterator<ASkyLight> It(World); It; ++It) { SkyLightActor = *It; break; }
	}
	if (!AtmosphereActor)
	{
		for (TActorIterator<ASkyAtmosphere> It(World); It; ++It) { AtmosphereActor = *It; break; }
	}
	if (!FogActor)
	{
		for (TActorIterator<AExponentialHeightFog> It(World); It; ++It) { FogActor = *It; break; }
	}
	if (!CloudActor)
	{
		for (TActorIterator<AVolumetricCloud> It(World); It; ++It) { CloudActor = *It; break; }
	}

	if (!bAllowSpawn || !World->IsGameWorld())
	{
		return;
	}

	if (!SunActor)
	{
		SunActor = SpawnSkyActor<ADirectionalLight>(World, SunTag, [](ADirectionalLight* A)
		{
			A->GetLightComponent()->SetMobility(EComponentMobility::Movable);
		});
		UE_LOG(LogGibraltar, Log, TEXT("Sky: spawned sun light."));
	}
	if (!MoonActor)
	{
		MoonActor = SpawnSkyActor<ADirectionalLight>(World, MoonTag, [](ADirectionalLight* A)
		{
			A->GetLightComponent()->SetMobility(EComponentMobility::Movable);
		});
		UE_LOG(LogGibraltar, Log, TEXT("Sky: spawned moon light."));
	}
	if (!AtmosphereActor)
	{
		AtmosphereActor = SpawnSkyActor<ASkyAtmosphere>(World, NAME_None, [](ASkyAtmosphere*) {});
		UE_LOG(LogGibraltar, Log, TEXT("Sky: spawned SkyAtmosphere."));
	}
	if (!SkyLightActor)
	{
		SkyLightActor = SpawnSkyActor<ASkyLight>(World, NAME_None, [](ASkyLight* A)
		{
			USkyLightComponent* Comp = A->GetLightComponent();
			Comp->SetMobility(EComponentMobility::Movable);
			Comp->bRealTimeCapture = true;
			Comp->SourceType = ESkyLightSourceType::SLS_CapturedScene;
		});
		UE_LOG(LogGibraltar, Log, TEXT("Sky: spawned real-time SkyLight."));
	}
	if (!FogActor)
	{
		FogActor = SpawnSkyActor<AExponentialHeightFog>(World, NAME_None, [](AExponentialHeightFog*) {});
		UE_LOG(LogGibraltar, Log, TEXT("Sky: spawned ExponentialHeightFog."));
	}
	if (!CloudActor)
	{
		CloudActor = SpawnSkyActor<AVolumetricCloud>(World, NAME_None, [](AVolumetricCloud*) {});
		UE_LOG(LogGibraltar, Log, TEXT("Sky: spawned VolumetricCloud."));
	}
}

void AGibraltarSkyController::ConfigureSkyActors()
{
	const bool bGame = GetWorld() && GetWorld()->IsGameWorld();

	if (SunActor)
	{
		if (UDirectionalLightComponent* Sun = Cast<UDirectionalLightComponent>(SunActor->GetLightComponent()))
		{
			if (bGame)
			{
				Sun->SetMobility(EComponentMobility::Movable);
			}
			Sun->SetAtmosphereSunLight(true);
			Sun->SetAtmosphereSunLightIndex(0);
			Sun->SetIntensity(SunIlluminanceLux);
			Sun->SetLightColor(FLinearColor::White);
		}
	}

	if (MoonActor)
	{
		if (UDirectionalLightComponent* Moon = Cast<UDirectionalLightComponent>(MoonActor->GetLightComponent()))
		{
			if (bGame)
			{
				Moon->SetMobility(EComponentMobility::Movable);
			}
			Moon->SetAtmosphereSunLightIndex(1);
			Moon->SetLightColor(FLinearColor(0.72f, 0.82f, 1.f));
			Moon->SetIntensity(0.f);
		}
	}

	if (SkyLightActor && bGame)
	{
		if (USkyLightComponent* Sky = SkyLightActor->GetLightComponent())
		{
			if (Sky->Mobility != EComponentMobility::Movable || !Sky->bRealTimeCapture)
			{
				Sky->SetMobility(EComponentMobility::Movable);
				Sky->bRealTimeCapture = true;
				Sky->MarkRenderStateDirty();
			}
		}
	}

	if (FogActor)
	{
		if (UExponentialHeightFogComponent* Fog = FogActor->GetComponent())
		{
			Fog->SetFogHeightFalloff(0.2f);
		}
	}

	if (Exposure)
	{
		Exposure->Settings.AutoExposureMinBrightness = MinExposureEV100;
		Exposure->Settings.AutoExposureMaxBrightness = MaxExposureEV100;
	}

	LastSunDirection = FVector::ZeroVector;
	LastMoonDirection = FVector::ZeroVector;
	LastFogDensity = -1.f;
	SunShadowState = -1;
	MoonState = -1;
}

// ---------------------------------------------------------------------------
// Lighting update

void AGibraltarSkyController::UpdateLighting(bool bForce)
{
	if (!bSimTimeInitialized)
	{
		InitSimTime();
	}

	const double Lat = FGibraltarGeo::OriginLatDeg;
	const double Lon = FGibraltarGeo::OriginLonDeg;
	SunPosition = FGibraltarAstronomy::SunPosition(SimUtc, Lat, Lon);
	MoonPosition = FGibraltarAstronomy::MoonPosition(SimUtc, Lat, Lon, MoonIllumination);

	const float SunElevation = static_cast<float>(SunPosition.ElevationDeg);
	const float CosThreshold = FMath::Cos(FMath::DegreesToRadians(MinLightAngleChangeDeg));

	// --- Sun -------------------------------------------------------------------
	if (SunActor)
	{
		const FVector ToSun = FGibraltarAstronomy::DirectionToUnreal(SunPosition);
		if (bForce || LastSunDirection.IsZero() || FVector::DotProduct(ToSun, LastSunDirection) < CosThreshold)
		{
			MarkForEditorSave(SunActor);
			// A directional light shines along its forward (+X) axis, i.e. away from the sun.
			SunActor->SetActorRotation((-ToSun).Rotation());
			LastSunDirection = ToSun;
		}

		if (UDirectionalLightComponent* Sun = Cast<UDirectionalLightComponent>(SunActor->GetLightComponent()))
		{
			// Keep full strength through civil/nautical twilight (the atmosphere does the
			// dimming and the twilight glow), fade out towards astronomical night.
			const float SunStrength = SkySmoothStep(-18.f, -12.f, SunElevation);
			Sun->SetIntensity(SunIlluminanceLux * SunStrength);

			const int32 NewShadowState = SunElevation > -2.f ? 1 : 0;
			if (NewShadowState != SunShadowState)
			{
				Sun->SetCastShadows(NewShadowState == 1);
				SunShadowState = NewShadowState;
			}
		}
	}

	// --- Moon / night light ---------------------------------------------------------
	if (MoonActor)
	{
		if (UDirectionalLightComponent* Moon = Cast<UDirectionalLightComponent>(MoonActor->GetLightComponent()))
		{
			const float Night = 1.f - SkySmoothStep(-8.f, 2.f, SunElevation);
			const float MoonElevation = static_cast<float>(MoonPosition.ElevationDeg);
			const bool bRealMoonUp = MoonElevation > 2.f;
			const float MoonUp = SkySmoothStep(-2.f, 6.f, MoonElevation);
			const float Lux = Night * (NightFloorLux + MoonIlluminanceLux * static_cast<float>(MoonIllumination) * MoonUp);

			// While the moon is down the night light comes from a fixed high direction
			// and must not draw a (fake) moon disk in the sky.
			const FVector ToMoon = FGibraltarAstronomy::DirectionToUnreal(bRealMoonUp ? MoonPosition : NightGlowPosition);
			if (bForce || LastMoonDirection.IsZero() || FVector::DotProduct(ToMoon, LastMoonDirection) < CosThreshold)
			{
				MarkForEditorSave(MoonActor);
				MoonActor->SetActorRotation((-ToMoon).Rotation());
				LastMoonDirection = ToMoon;
			}

			const int32 NewMoonState = (Lux > 1e-4f ? 1 : 0) | (bRealMoonUp ? 2 : 0) | (Night > 0.5f ? 4 : 0);
			if (NewMoonState != MoonState)
			{
				Moon->SetVisibility(Lux > 1e-4f);
				Moon->SetAtmosphereSunLight(bRealMoonUp);
				Moon->SetCastShadows(Night > 0.5f);
				MoonState = NewMoonState;
			}
			Moon->SetIntensity(Lux);
		}
	}

	// --- Haze: only in daylight so it doesn't glow at night ------------------------
	if (FogActor)
	{
		if (UExponentialHeightFogComponent* Fog = FogActor->GetComponent())
		{
			const float Density = DaytimeFogDensity * GetDaylightFactor();
			if (bForce || FMath::Abs(Density - LastFogDensity) > 1e-5f)
			{
				Fog->SetFogDensity(Density);
				LastFogDensity = Density;
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Lifecycle

void AGibraltarSkyController::BeginPlay()
{
	Super::BeginPlay();

	if (!bSimTimeInitialized)
	{
		InitSimTime();
	}
	bTimePaused = bStartPaused;

	FindOrSpawnSkyActors(bSpawnMissingSkyActors);
	ConfigureSkyActors();
	UpdateLighting(true);

	UE_LOG(LogGibraltar, Log, TEXT("Sky: %s, sun elevation %.1f deg azimuth %.1f deg."),
		*GetTimeDescription(), SunPosition.ElevationDeg, SunPosition.AzimuthDeg);
}

void AGibraltarSkyController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bTimePaused && TimeSpeed > 0.f)
	{
		SimUtc += FTimespan::FromSeconds(static_cast<double>(DeltaSeconds) * TimeSpeed);
	}
	UpdateLighting(false);
}

void AGibraltarSkyController::ApplyTimeOfDayNow()
{
	if (!bSimTimeInitialized || !(GetWorld() && GetWorld()->IsGameWorld()))
	{
		InitSimTime();
	}
	FindOrSpawnSkyActors(false);
	ConfigureSkyActors();
	UpdateLighting(true);

	UE_LOG(LogGibraltar, Log, TEXT("Sky preview: %s, sun elevation %.1f deg azimuth %.1f deg."),
		*GetTimeDescription(), SunPosition.ElevationDeg, SunPosition.AzimuthDeg);
}
