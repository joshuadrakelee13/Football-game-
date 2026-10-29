// Gibraltar - point of interest actor.

#include "GibraltarLandmark.h"
#include "GibraltarGeo.h"

#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SphereComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/CollisionProfile.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "UObject/ConstructorHelpers.h"

AGibraltarLandmark::AGibraltarLandmark()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;
	PrimaryActorTick.TickInterval = 0.f;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Root->SetMobility(EComponentMobility::Static);
	SetRootComponent(Root);

	// A slim post (engine basic cylinder: 100 cm diameter/height, pivot at centre).
	Post = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Post"));
	Post->SetupAttachment(Root);
	Post->SetMobility(EComponentMobility::Static);
	Post->SetRelativeScale3D(FVector(0.16, 0.16, 1.1));
	Post->SetRelativeLocation(FVector(0.0, 0.0, 55.0));
	Post->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (CylinderMesh.Succeeded())
	{
		Post->SetStaticMesh(CylinderMesh.Object);
	}

	// Generous target for the E-key line trace (Visibility channel only).
	InteractionVolume = CreateDefaultSubobject<USphereComponent>(TEXT("InteractionVolume"));
	InteractionVolume->SetupAttachment(Root);
	InteractionVolume->SetMobility(EComponentMobility::Static);
	InteractionVolume->InitSphereRadius(70.f);
	InteractionVolume->SetRelativeLocation(FVector(0.0, 0.0, 120.0));
	InteractionVolume->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	InteractionVolume->SetCollisionResponseToAllChannels(ECR_Ignore);
	InteractionVolume->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	InteractionVolume->SetGenerateOverlapEvents(false);
	InteractionVolume->SetCanEverAffectNavigation(false);

	NameLabel = CreateDefaultSubobject<UTextRenderComponent>(TEXT("NameLabel"));
	NameLabel->SetupAttachment(Root);
	NameLabel->SetMobility(EComponentMobility::Movable);
	NameLabel->SetRelativeLocation(FVector(0.0, 0.0, 230.0));
	NameLabel->SetHorizontalAlignment(EHTA_Center);
	NameLabel->SetVerticalAlignment(EVRTA_TextBottom);
	NameLabel->SetWorldSize(26.f);
	NameLabel->SetTextRenderColor(FColor(255, 244, 214));
	NameLabel->SetCastShadow(false);
	NameLabel->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	NameLabel->SetText(FText::FromString(TEXT("Landmark")));
}

void AGibraltarLandmark::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	RefreshLabel();
}

void AGibraltarLandmark::BeginPlay()
{
	Super::BeginPlay();
	RefreshLabel();
	NameLabel->SetVisibility(false);
}

void AGibraltarLandmark::RefreshLabel()
{
	if (NameLabel)
	{
		NameLabel->SetText(FText::FromString(LandmarkName.IsEmpty() ? TEXT("Landmark") : LandmarkName));
	}
}

void AGibraltarLandmark::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	if (!PC || !PC->PlayerCameraManager || !NameLabel)
	{
		return;
	}

	const FVector CameraLocation = PC->PlayerCameraManager->GetCameraLocation();
	const FVector LabelLocation = NameLabel->GetComponentLocation();
	const bool bNear = FVector::DistSquared(CameraLocation, LabelLocation) < FMath::Square(LabelVisibleDistance);

	if (NameLabel->IsVisible() != bNear)
	{
		NameLabel->SetVisibility(bNear);
	}
	if (bNear)
	{
		// The text faces its local +X; point that at the camera (yaw only).
		const FVector ToCamera = CameraLocation - LabelLocation;
		NameLabel->SetWorldRotation(FRotator(0.0, ToCamera.Rotation().Yaw, 0.0));
	}
}

bool AGibraltarLandmark::GetInteractionInfo(FGibraltarInteractionInfo& OutInfo) const
{
	OutInfo.Title = LandmarkName.IsEmpty() ? TEXT("Unnamed place") : LandmarkName;
	OutInfo.Subtitle = Kind;
	OutInfo.Description = Description;
	OutInfo.Source.Reset();
	if (!Source.IsEmpty())
	{
		OutInfo.Source = PoiId.IsEmpty()
			? FString::Printf(TEXT("Source: %s"), *Source)
			: FString::Printf(TEXT("Source: %s  (%s)"), *Source, *PoiId);
	}
	OutInfo.PromptVerb = TEXT("Read about");

	const FVector Ltm = FGibraltarGeo::UnrealToLtm(GetActorLocation());
	FGibraltarGeo::LtmToLonLat(Ltm.X, Ltm.Y, OutInfo.Longitude, OutInfo.Latitude);
	OutInfo.HeightM = Ltm.Z;
	OutInfo.bHasLocation = true;
	return true;
}
