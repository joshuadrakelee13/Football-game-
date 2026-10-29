// Gibraltar - a point of interest from the manifest ("pois"), placed by the import script.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GibraltarInteractable.h"
#include "GibraltarLandmark.generated.h"

class USceneComponent;
class UStaticMeshComponent;
class USphereComponent;
class UTextRenderComponent;

/**
 * A small information post with a floating name label. Look at it from within
 * ~3 m and press E to read about the place. The actor's location is the
 * manifest POI position (GIB-LTM -> Unreal), so lon/lat are derived from it.
 */
UCLASS()
class GIBRALTAR_API AGibraltarLandmark : public AActor, public IGibraltarInteractable
{
	GENERATED_BODY()

public:
	AGibraltarLandmark();

	/** Display name, e.g. "Moorish Castle". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	FString LandmarkName;

	/** OSM-style kind, e.g. "historic=castle". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	FString Kind;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark", meta = (MultiLine = true))
	FString Description;

	/** Attribution, e.g. "OpenStreetMap". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	FString Source;

	/** Manifest id, e.g. "osm:node/123". */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	FString PoiId;

	/** Name label is shown when the camera is closer than this (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	float LabelVisibleDistance = 6000.f;

	// IGibraltarInteractable
	virtual bool GetInteractionInfo(FGibraltarInteractionInfo& OutInfo) const override;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

protected:
	UPROPERTY(VisibleAnywhere, Category = "Landmark")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Landmark")
	TObjectPtr<UStaticMeshComponent> Post;

	UPROPERTY(VisibleAnywhere, Category = "Landmark")
	TObjectPtr<USphereComponent> InteractionVolume;

	UPROPERTY(VisibleAnywhere, Category = "Landmark")
	TObjectPtr<UTextRenderComponent> NameLabel;

private:
	void RefreshLabel();
};
