// Gibraltar - component that makes any actor interactable.

#include "GibraltarInteractableComponent.h"
#include "GibraltarGeo.h"
#include "GameFramework/Actor.h"

UGibraltarInteractableComponent::UGibraltarInteractableComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

bool UGibraltarInteractableComponent::GetInteractionInfo(FGibraltarInteractionInfo& OutInfo) const
{
	if (Title.IsEmpty())
	{
		return false;
	}

	OutInfo.Title = Title;
	OutInfo.Subtitle = Subtitle;
	OutInfo.Description = Description;
	OutInfo.Source = Source;
	OutInfo.PromptVerb = PromptVerb;
	OutInfo.bHasLocation = false;

	if (bShowLocation)
	{
		if (const AActor* Owner = GetOwner())
		{
			const FVector Ltm = FGibraltarGeo::UnrealToLtm(Owner->GetActorLocation());
			FGibraltarGeo::LtmToLonLat(Ltm.X, Ltm.Y, OutInfo.Longitude, OutInfo.Latitude);
			OutInfo.HeightM = Ltm.Z;
			OutInfo.bHasLocation = true;
		}
	}
	return true;
}
