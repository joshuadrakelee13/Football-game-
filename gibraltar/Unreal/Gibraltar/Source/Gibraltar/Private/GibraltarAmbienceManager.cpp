// Gibraltar - ambient sound beds.

#include "GibraltarAmbienceManager.h"
#include "Gibraltar.h"
#include "GibraltarGameInstance.h"
#include "GibraltarSkyController.h"

#include "Components/AudioComponent.h"
#include "Components/SceneComponent.h"
#include "Sound/SoundBase.h"
#include "Sound/SoundWave.h"
#include "Camera/PlayerCameraManager.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "Engine/World.h"
#include "Engine/HitResult.h"
#include "CollisionQueryParams.h"
#include "EngineUtils.h"

namespace
{
	float AmbienceSmoothStep(float Edge0, float Edge1, float X)
	{
		const float T = FMath::Clamp((X - Edge0) / (Edge1 - Edge0), 0.f, 1.f);
		return T * T * (3.f - 2.f * T);
	}
}

AGibraltarAmbienceManager::AGibraltarAmbienceManager()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	SeaAudio = MakeBed(TEXT("SeaAudio"));
	WindAudio = MakeBed(TEXT("WindAudio"));
	BirdsAudio = MakeBed(TEXT("BirdsAudio"));
	CricketsAudio = MakeBed(TEXT("CricketsAudio"));

	// Imported by Scripts/import_gibraltar.py from gibraltar/data/audio/*.wav.
	SeaSound = TSoftObjectPtr<USoundBase>(FSoftObjectPath(TEXT("/Game/Gibraltar/Audio/sea_waves.sea_waves")));
	WindSound = TSoftObjectPtr<USoundBase>(FSoftObjectPath(TEXT("/Game/Gibraltar/Audio/wind.wind")));
	BirdsSound = TSoftObjectPtr<USoundBase>(FSoftObjectPath(TEXT("/Game/Gibraltar/Audio/birds_day.birds_day")));
	CricketsSound = TSoftObjectPtr<USoundBase>(FSoftObjectPath(TEXT("/Game/Gibraltar/Audio/crickets_night.crickets_night")));
}

UAudioComponent* AGibraltarAmbienceManager::MakeBed(const TCHAR* Name)
{
	UAudioComponent* Audio = CreateDefaultSubobject<UAudioComponent>(Name);
	Audio->SetupAttachment(Root);
	Audio->bAutoActivate = false;
	Audio->bAllowSpatialization = false;   // 2D beds
	Audio->bIsUISound = false;
	return Audio;
}

bool AGibraltarAmbienceManager::StartBed(UAudioComponent* Audio, const TSoftObjectPtr<USoundBase>& Sound, const TCHAR* Label)
{
	if (!Audio || Sound.IsNull())
	{
		return false;
	}

	USoundBase* Loaded = Sound.LoadSynchronous();
	if (!Loaded)
	{
		UE_LOG(LogGibraltar, Warning, TEXT("Ambience: '%s' sound not found at %s (run Scripts/BuildWorld.bat after the pipeline has written data/audio). Continuing without it."),
			Label, *Sound.ToSoftObjectPath().ToString());
		return false;
	}

	// The import script marks the waves as looping; make sure anyway.
	if (USoundWave* Wave = Cast<USoundWave>(Loaded))
	{
		if (!Wave->bLooping)
		{
			Wave->bLooping = true;
		}
	}

	Audio->SetSound(Loaded);
	Audio->SetVolumeMultiplier(0.001f);
	Audio->OnAudioFinished.AddDynamic(this, &AGibraltarAmbienceManager::HandleAudioFinished);
	Audio->Play(FMath::FRandRange(0.f, 5.f));
	return true;
}

void AGibraltarAmbienceManager::BeginPlay()
{
	Super::BeginPlay();

	StartBed(SeaAudio, SeaSound, TEXT("sea_waves"));
	StartBed(WindAudio, WindSound, TEXT("wind"));
	StartBed(BirdsAudio, BirdsSound, TEXT("birds_day"));
	StartBed(CricketsAudio, CricketsSound, TEXT("crickets_night"));

	for (TActorIterator<AGibraltarSkyController> It(GetWorld()); It; ++It)
	{
		SkyController = *It;
		break;
	}
	ProbeTimer = 0.f;
}

void AGibraltarAmbienceManager::HandleAudioFinished()
{
	// Fallback looping for non-looping assets.
	for (UAudioComponent* Audio : { SeaAudio.Get(), WindAudio.Get(), BirdsAudio.Get(), CricketsAudio.Get() })
	{
		if (Audio && Audio->Sound && !Audio->IsPlaying())
		{
			Audio->Play();
		}
	}
}

float AGibraltarAmbienceManager::MeasureSeaFraction(const FVector& ListenerLocation) const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return 0.f;
	}

	static const float Radii[3] = { 4000.f, 12000.f, 30000.f };
	static const float Weights[3] = { 1.0f, 0.6f, 0.3f };
	constexpr int32 Directions = 8;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(GibraltarAmbienceTrace), false);
	if (const APlayerController* PC = World->GetFirstPlayerController())
	{
		if (const APawn* PlayerPawn = PC->GetPawn())
		{
			Params.AddIgnoredActor(PlayerPawn);
		}
	}

	float WeightedSea = 0.f;
	float TotalWeight = 0.f;
	for (int32 Ring = 0; Ring < 3; ++Ring)
	{
		int32 SeaHits = 0;
		for (int32 D = 0; D < Directions; ++D)
		{
			const float Angle = (2.f * PI * D) / Directions + Ring * 0.39f;
			const FVector Offset(FMath::Cos(Angle) * Radii[Ring], FMath::Sin(Angle) * Radii[Ring], 0.f);
			const FVector Start(ListenerLocation.X + Offset.X, ListenerLocation.Y + Offset.Y, 60000.f);
			const FVector End(Start.X, Start.Y, -2000.f);

			FHitResult Hit;
			const bool bHit = World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params);
			if (!bHit || Hit.ImpactPoint.Z < 150.f)
			{
				++SeaHits;
			}
		}
		WeightedSea += Weights[Ring] * (static_cast<float>(SeaHits) / Directions);
		TotalWeight += Weights[Ring];
	}
	return TotalWeight > 0.f ? WeightedSea / TotalWeight : 0.f;
}

void AGibraltarAmbienceManager::Probe()
{
	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	if (!PC || !PC->PlayerCameraManager)
	{
		return;
	}

	const FVector Listener = PC->PlayerCameraManager->GetCameraLocation();
	const float HeightM = static_cast<float>(Listener.Z / 100.0);
	const float Height01 = FMath::Clamp(HeightM / RockHeightM, 0.f, 1.f);

	const float Sea = MeasureSeaFraction(Listener);
	const float SunElevation = SkyController.IsValid() ? static_cast<float>(SkyController->GetSunElevationDeg()) : 30.f;
	const float Day = AmbienceSmoothStep(-6.f, 4.f, SunElevation);
	const float Night = 1.f - AmbienceSmoothStep(-8.f, 0.f, SunElevation);

	// Surf is loud at the waterline and fades as you climb (still faintly audible up top).
	const float SeaHeightFade = FMath::Lerp(1.f, 0.25f, AmbienceSmoothStep(5.f, 300.f, HeightM));
	TargetSea = FMath::Pow(Sea, 0.7f) * SeaHeightFade;

	// Wind: a breeze in town, strong on the ridge; a bit more over open water.
	TargetWind = FMath::Clamp(FMath::Lerp(0.15f, 1.f, Height01) + 0.15f * Sea, 0.f, 1.f);

	// Birds by day (gulls everywhere, a little fewer on the summit).
	TargetBirds = Day * FMath::Lerp(1.f, 0.6f, Height01);

	// Crickets at night, in vegetation rather than over the water.
	TargetCrickets = Night * (1.f - 0.7f * Sea) * (HeightM < 380.f ? 1.f : 0.5f);
}

void AGibraltarAmbienceManager::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	ProbeTimer -= DeltaSeconds;
	if (ProbeTimer <= 0.f)
	{
		ProbeTimer = ProbeInterval;
		Probe();
	}

	const float Rate = 0.8f;
	CurrentSea = FMath::FInterpTo(CurrentSea, TargetSea, DeltaSeconds, Rate);
	CurrentWind = FMath::FInterpTo(CurrentWind, TargetWind, DeltaSeconds, Rate);
	CurrentBirds = FMath::FInterpTo(CurrentBirds, TargetBirds, DeltaSeconds, Rate);
	CurrentCrickets = FMath::FInterpTo(CurrentCrickets, TargetCrickets, DeltaSeconds, Rate);

	float Master = 0.8f;
	if (const UGibraltarGameInstance* GI = Cast<UGibraltarGameInstance>(GetGameInstance()))
	{
		Master = GI->GetUserSettings().MasterVolume;
	}

	// Never exactly zero: a silent component may get virtualised and restart from the top.
	auto Apply = [Master](UAudioComponent* Audio, float Level, float Base)
	{
		if (Audio && Audio->Sound)
		{
			Audio->SetVolumeMultiplier(FMath::Max(0.001f, Level * Base * Master));
		}
	};
	Apply(SeaAudio, CurrentSea, SeaVolume);
	Apply(WindAudio, CurrentWind, WindVolume);
	Apply(BirdsAudio, CurrentBirds, BirdsVolume);
	Apply(CricketsAudio, CurrentCrickets, CricketsVolume);
}
