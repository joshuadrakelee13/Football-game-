// Gibraltar - game mode.

#include "GibraltarGameMode.h"
#include "Gibraltar.h"
#include "GibraltarCharacter.h"
#include "GibraltarHUD.h"
#include "GibraltarPlayerController.h"
#include "GibraltarSkyController.h"
#include "GibraltarAmbienceManager.h"

#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerStart.h"

AGibraltarGameMode::AGibraltarGameMode()
{
	DefaultPawnClass = AGibraltarCharacter::StaticClass();
	PlayerControllerClass = AGibraltarPlayerController::StaticClass();
	HUDClass = AGibraltarHUD::StaticClass();
}

void AGibraltarGameMode::StartPlay()
{
	UWorld* World = GetWorld();

	// The level is normally built by Scripts/import_gibraltar.py. If someone opens
	// an empty map, still give them a sky and sound so it's obvious things work.
	if (World)
	{
		bool bHasSky = false;
		for (TActorIterator<AGibraltarSkyController> It(World); It; ++It) { bHasSky = true; break; }
		if (!bHasSky)
		{
			UE_LOG(LogGibraltar, Warning, TEXT("No AGibraltarSkyController in the level; spawning one. Run Scripts/BuildWorld.bat to build the real level."));
			World->SpawnActor<AGibraltarSkyController>();
		}

		bool bHasAmbience = false;
		for (TActorIterator<AGibraltarAmbienceManager> It(World); It; ++It) { bHasAmbience = true; break; }
		if (!bHasAmbience)
		{
			World->SpawnActor<AGibraltarAmbienceManager>();
		}

		bool bHasStart = false;
		for (TActorIterator<APlayerStart> It(World); It; ++It) { bHasStart = true; break; }
		if (!bHasStart)
		{
			UE_LOG(LogGibraltar, Warning, TEXT("No PlayerStart in the level: placing the player on the ground at the world origin. Run Scripts/BuildWorld.bat."));
			for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
			{
				if (APlayerController* PC = It->Get())
				{
					if (AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(PC->GetPawn()))
					{
						Walker->RescueToGround(FText::GetEmpty());
					}
				}
			}
		}
	}

	Super::StartPlay();
}
