// Gibraltar - interface for things the player can look at and press E on.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "GibraltarTypes.h"
#include "GibraltarInteractable.generated.h"

class APawn;

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class UGibraltarInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Implement on an actor to make it interactable. Actors that don't implement
 * it can instead carry a UGibraltarInteractableComponent.
 */
class GIBRALTAR_API IGibraltarInteractable
{
	GENERATED_BODY()

public:
	/** Fill in what the HUD should show. Return false to be ignored right now. */
	virtual bool GetInteractionInfo(FGibraltarInteractionInfo& OutInfo) const { return false; }

	/** Called when the player presses E while looking at this. */
	virtual void OnInteract(APawn* InstigatorPawn) {}
};
