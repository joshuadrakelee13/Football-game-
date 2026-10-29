// Gibraltar - component that makes any actor interactable (alternative to the interface).

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GibraltarTypes.h"
#include "GibraltarInteractableComponent.generated.h"

UCLASS(ClassGroup = (Gibraltar), meta = (BlueprintSpawnableComponent))
class GIBRALTAR_API UGibraltarInteractableComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UGibraltarInteractableComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FString Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FString Subtitle;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction", meta = (MultiLine = true))
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FString Source;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FString PromptVerb = TEXT("Read about");

	/** Show the owner's lon/lat/height in the info panel. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	bool bShowLocation = true;

	bool GetInteractionInfo(FGibraltarInteractionInfo& OutInfo) const;
};
