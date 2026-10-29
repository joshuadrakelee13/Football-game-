// Gibraltar - game mode (no rules: just walk).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GibraltarGameMode.generated.h"

UCLASS()
class GIBRALTAR_API AGibraltarGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AGibraltarGameMode();

	virtual void StartPlay() override;
};
