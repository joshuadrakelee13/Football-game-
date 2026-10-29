// Gibraltar - first-person walker.

#include "GibraltarCharacter.h"
#include "Gibraltar.h"
#include "GibraltarGeo.h"
#include "GibraltarInputConfig.h"
#include "GibraltarInteractable.h"
#include "GibraltarInteractableComponent.h"
#include "GibraltarPlayerController.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/Controller.h"
#include "Engine/World.h"
#include "Engine/HitResult.h"
#include "CollisionQueryParams.h"
#include "EnhancedInputComponent.h"
#include "InputActionValue.h"

AGibraltarCharacter::AGibraltarCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	// Tick after movement so the camera smoothing sees this frame's step-ups.
	PrimaryActorTick.TickGroup = TG_PostPhysics;

	// 1.76 m tall, 68 cm wide.
	GetCapsuleComponent()->InitCapsuleSize(34.f, 88.f);

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = true;
	bUseControllerRotationRoll = false;

	FirstPersonCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FirstPersonCamera"));
	FirstPersonCamera->SetupAttachment(GetCapsuleComponent());
	CameraBaseZ = StandingEyeHeightCm - 88.f;
	FirstPersonCamera->SetRelativeLocation(FVector(0.0, 0.0, CameraBaseZ));
	FirstPersonCamera->bUsePawnControlRotation = true;
	FirstPersonCamera->SetFieldOfView(90.f);

	BaseEyeHeight = StandingEyeHeightCm - 88.f;
	CrouchedEyeHeight = CrouchedEyeHeightCm - 55.f;

	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = false;
	Move->MaxWalkSpeed = WalkSpeed;
	Move->MaxWalkSpeedCrouched = CrouchSpeed;
	Move->MaxAcceleration = 1400.f;
	Move->BrakingDecelerationWalking = 1600.f;
	Move->GroundFriction = 8.f;
	Move->MaxStepHeight = 45.f;
	Move->SetWalkableFloorAngle(50.f);
	Move->JumpZVelocity = 320.f;   // ~0.5 m jump, like a real person
	Move->AirControl = 0.25f;
	Move->GravityScale = 1.f;
	Move->SetCrouchedHalfHeight(55.f);
	Move->GetNavAgentPropertiesRef().bCanCrouch = true;
	Move->bCanWalkOffLedgesWhenCrouching = true;
}

void AGibraltarCharacter::BeginPlay()
{
	Super::BeginPlay();
	ResetCameraSmoothing();
	UpdateMoveSpeed();
}

// ---------------------------------------------------------------------------
// Input

void AGibraltarCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!Input)
	{
		UE_LOG(LogGibraltar, Error, TEXT("Player input component is not an UEnhancedInputComponent. Check Config/DefaultInput.ini."));
		return;
	}

	AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(GetController());
	UGibraltarInputConfig* Config = PC ? PC->GetInputConfig() : nullptr;
	if (!Config)
	{
		UE_LOG(LogGibraltar, Error, TEXT("No Gibraltar input config: is the player controller AGibraltarPlayerController?"));
		return;
	}

	Input->BindAction(Config->MoveAction, ETriggerEvent::Triggered, this, &AGibraltarCharacter::HandleMove);
	Input->BindAction(Config->LookAction, ETriggerEvent::Triggered, this, &AGibraltarCharacter::HandleLook);
	Input->BindAction(Config->JumpAction, ETriggerEvent::Started, this, &AGibraltarCharacter::HandleJumpStarted);
	Input->BindAction(Config->JumpAction, ETriggerEvent::Completed, this, &AGibraltarCharacter::HandleJumpCompleted);
	Input->BindAction(Config->RunAction, ETriggerEvent::Started, this, &AGibraltarCharacter::HandleRunStarted);
	Input->BindAction(Config->RunAction, ETriggerEvent::Completed, this, &AGibraltarCharacter::HandleRunCompleted);
	Input->BindAction(Config->CrouchToggleAction, ETriggerEvent::Started, this, &AGibraltarCharacter::HandleCrouchToggle);
	Input->BindAction(Config->CrouchHoldAction, ETriggerEvent::Started, this, &AGibraltarCharacter::HandleCrouchHoldStarted);
	Input->BindAction(Config->CrouchHoldAction, ETriggerEvent::Completed, this, &AGibraltarCharacter::HandleCrouchHoldCompleted);
	Input->BindAction(Config->InteractAction, ETriggerEvent::Started, this, &AGibraltarCharacter::HandleInteract);
}

void AGibraltarCharacter::HandleMove(const FInputActionValue& Value)
{
	if (bWaitingForGround)
	{
		return;
	}
	const FVector2D Axis = Value.Get<FVector2D>();
	AddMovementInput(GetActorForwardVector(), Axis.Y);
	AddMovementInput(GetActorRightVector(), Axis.X);
}

void AGibraltarCharacter::HandleLook(const FInputActionValue& Value)
{
	AController* C = GetController();
	if (!C)
	{
		return;
	}
	const FVector2D Delta = Value.Get<FVector2D>() * (BaseLookScale * LookSensitivity);

	// Set the control rotation directly so the result doesn't depend on the
	// engine's legacy input scale settings. Mouse up (+Y) looks up.
	FRotator Rotation = C->GetControlRotation();
	Rotation.Yaw = FRotator::NormalizeAxis(Rotation.Yaw + Delta.X);
	const double PitchDelta = bInvertLookY ? -Delta.Y : Delta.Y;
	Rotation.Pitch = FMath::Clamp(FRotator::NormalizeAxis(Rotation.Pitch + PitchDelta), -89.0, 89.0);
	Rotation.Roll = 0.0;
	C->SetControlRotation(Rotation);
}

void AGibraltarCharacter::HandleJumpStarted()
{
	if (bIsCrouched)
	{
		UnCrouch();
		return;
	}
	Jump();
}

void AGibraltarCharacter::HandleJumpCompleted()
{
	StopJumping();
}

void AGibraltarCharacter::HandleRunStarted()
{
	bWantsToRun = true;
	if (bIsCrouched)
	{
		UnCrouch();
	}
	UpdateMoveSpeed();
}

void AGibraltarCharacter::HandleRunCompleted()
{
	bWantsToRun = false;
	UpdateMoveSpeed();
}

void AGibraltarCharacter::HandleCrouchToggle()
{
	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
	}
}

void AGibraltarCharacter::HandleCrouchHoldStarted()
{
	Crouch();
}

void AGibraltarCharacter::HandleCrouchHoldCompleted()
{
	UnCrouch();
}

void AGibraltarCharacter::HandleInteract()
{
	AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(GetController());
	if (!PC)
	{
		return;
	}

	if (PC->IsInfoPanelOpen())
	{
		PC->CloseInfoPanel();
		return;
	}

	if (bHasFocus && FocusedActor.IsValid())
	{
		if (IGibraltarInteractable* Interactable = Cast<IGibraltarInteractable>(FocusedActor.Get()))
		{
			Interactable->OnInteract(this);
		}
		PC->OpenInfoPanel(FocusedInfo);
	}
}

void AGibraltarCharacter::UpdateMoveSpeed()
{
	GetCharacterMovement()->MaxWalkSpeed = bWantsToRun ? RunSpeed : WalkSpeed;
	GetCharacterMovement()->MaxWalkSpeedCrouched = CrouchSpeed;
}

void AGibraltarCharacter::ApplyUserSettings(const FGibraltarUserSettings& Settings)
{
	FirstPersonCamera->SetFieldOfView(Settings.FieldOfView);
	LookSensitivity = Settings.MouseSensitivity;
	bInvertLookY = Settings.bInvertY;
}

// ---------------------------------------------------------------------------
// Tick

void AGibraltarCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UpdateSafety(DeltaSeconds);
	UpdateCamera(DeltaSeconds);
	UpdateFocus();
}

void AGibraltarCharacter::ResetCameraSmoothing()
{
	StairOffset = 0.f;
	bHavePrevZ = false;
	bPrevOnGround = false;
	CameraBaseZ = (bIsCrouched ? CrouchedEyeHeightCm : StandingEyeHeightCm) - GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight();
	FirstPersonCamera->SetRelativeLocation(FVector(0.0, 0.0, CameraBaseZ));
}

void AGibraltarCharacter::UpdateCamera(float DeltaSeconds)
{
	// Eye height relative to the capsule centre (the capsule shrinks when crouched).
	const float HalfHeight = GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight();
	const float TargetBaseZ = (bIsCrouched ? CrouchedEyeHeightCm : StandingEyeHeightCm) - HalfHeight;
	CameraBaseZ = FMath::FInterpTo(CameraBaseZ, TargetBaseZ, DeltaSeconds, CrouchCameraSpeed);

	// Stair smoothing: while walking, the capsule pops up/down by a whole step
	// in one frame. Counter that pop and let the camera catch up smoothly.
	const double ActorZ = GetActorLocation().Z;
	const bool bOnGround = GetCharacterMovement()->IsMovingOnGround();
	if (bHavePrevZ && bOnGround && bPrevOnGround)
	{
		StairOffset -= static_cast<float>(ActorZ - PrevActorZ);
		StairOffset = FMath::Clamp(StairOffset, -MaxStairOffset, MaxStairOffset);
	}
	StairOffset = FMath::FInterpTo(StairOffset, 0.f, DeltaSeconds, StairSmoothingSpeed);

	PrevActorZ = ActorZ;
	bPrevOnGround = bOnGround;
	bHavePrevZ = true;

	FirstPersonCamera->SetRelativeLocation(FVector(0.0, 0.0, CameraBaseZ + StairOffset));
}

void AGibraltarCharacter::OnStartCrouch(float HalfHeightAdjust, float ScaledHalfHeightAdjust)
{
	Super::OnStartCrouch(HalfHeightAdjust, ScaledHalfHeightAdjust);
	// The capsule centre just dropped by HalfHeightAdjust: keep the eye where it was
	// and let UpdateCamera lower it smoothly. Don't count the drop as a stair step.
	CameraBaseZ += HalfHeightAdjust;
	PrevActorZ -= ScaledHalfHeightAdjust;
	FirstPersonCamera->SetRelativeLocation(FVector(0.0, 0.0, CameraBaseZ + StairOffset));
}

void AGibraltarCharacter::OnEndCrouch(float HalfHeightAdjust, float ScaledHalfHeightAdjust)
{
	Super::OnEndCrouch(HalfHeightAdjust, ScaledHalfHeightAdjust);
	CameraBaseZ -= HalfHeightAdjust;
	PrevActorZ += ScaledHalfHeightAdjust;
	FirstPersonCamera->SetRelativeLocation(FVector(0.0, 0.0, CameraBaseZ + StairOffset));
}

// ---------------------------------------------------------------------------
// Interaction

bool AGibraltarCharacter::ResolveInteraction(AActor* Actor, FGibraltarInteractionInfo& OutInfo)
{
	if (!Actor)
	{
		return false;
	}
	if (const IGibraltarInteractable* Interactable = Cast<IGibraltarInteractable>(Actor))
	{
		if (Interactable->GetInteractionInfo(OutInfo))
		{
			return true;
		}
	}
	if (const UGibraltarInteractableComponent* Component = Actor->FindComponentByClass<UGibraltarInteractableComponent>())
	{
		return Component->GetInteractionInfo(OutInfo);
	}
	return false;
}

void AGibraltarCharacter::UpdateFocus()
{
	bHasFocus = false;
	FocusedActor.Reset();

	UWorld* World = GetWorld();
	if (!World || !FirstPersonCamera)
	{
		return;
	}

	const FVector Start = FirstPersonCamera->GetComponentLocation();
	const FVector End = Start + FirstPersonCamera->GetForwardVector() * InteractDistance;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(GibraltarInteractTrace), /*bTraceComplex*/ true, this);
	FHitResult Hit;
	if (World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
	{
		AActor* HitActor = Hit.GetActor();
		FGibraltarInteractionInfo Info;
		if (ResolveInteraction(HitActor, Info))
		{
			bHasFocus = true;
			FocusedActor = HitActor;
			FocusedInfo = MoveTemp(Info);
		}
	}
}

bool AGibraltarCharacter::GetFocusedInteraction(FGibraltarInteractionInfo& OutInfo) const
{
	if (bHasFocus && FocusedActor.IsValid())
	{
		OutInfo = FocusedInfo;
		return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Safety, teleporting and heights

double AGibraltarCharacter::GetFeetHeightM() const
{
	return (GetActorLocation().Z - GetCapsuleComponent()->GetScaledCapsuleHalfHeight()) / 100.0;
}

double AGibraltarCharacter::GetEyeHeightM() const
{
	return FirstPersonCamera ? FirstPersonCamera->GetComponentLocation().Z / 100.0 : GetActorLocation().Z / 100.0;
}

void AGibraltarCharacter::ShowToast(const FText& Message) const
{
	if (AGibraltarPlayerController* PC = Cast<AGibraltarPlayerController>(GetController()))
	{
		PC->ShowToast(Message, 4.f);
	}
}

void AGibraltarCharacter::TeleportToLocation(const FVector& Location, const FRotator& ViewRotation, bool bCrouched)
{
	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->StopMovementImmediately();

	SetActorLocationAndRotation(Location, FRotator(0.0, ViewRotation.Yaw, 0.0), false, nullptr, ETeleportType::TeleportPhysics);
	if (AController* C = GetController())
	{
		C->SetControlRotation(FRotator(FMath::Clamp(FRotator::NormalizeAxis(ViewRotation.Pitch), -89.0, 89.0), ViewRotation.Yaw, 0.0));
	}

	if (bCrouched)
	{
		Crouch();
	}

	// Freeze until something solid has streamed in below us.
	Move->DisableMovement();
	bWaitingForGround = true;
	WaitForGroundTime = 0.f;
	bHasSafeLocation = false;
	ResetCameraSmoothing();
}

void AGibraltarCharacter::RescueToGround(const FText& Reason)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FVector Target = FVector::ZeroVector;
	bool bFound = false;

	// 1) The last place we stood on dry land.
	if (bHasSafeLocation)
	{
		Target = LastSafeLocation;
		bFound = true;
	}

	// 2) Whatever is highest straight below/above us.
	if (!bFound)
	{
		const FVector Here = GetActorLocation();
		FCollisionQueryParams Params(SCENE_QUERY_STAT(GibraltarRescueTrace), true, this);
		FHitResult Hit;
		if (World->LineTraceSingleByChannel(Hit, FVector(Here.X, Here.Y, 100000.0), FVector(Here.X, Here.Y, -10000.0), ECC_Pawn, Params)
			&& Hit.ImpactPoint.Z > -50.0)
		{
			Target = Hit.ImpactPoint + FVector(0.0, 0.0, GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 5.0);
			bFound = true;
		}
	}

	// 3) The level's PlayerStart.
	if (!bFound)
	{
		if (AGameModeBase* GameMode = World->GetAuthGameMode())
		{
			if (AActor* Start = GameMode->FindPlayerStart(GetController()))
			{
				Target = Start->GetActorLocation();
				bFound = true;
			}
		}
	}

	if (!bFound)
	{
		Target = FVector(0.0, 0.0, 50000.0);
	}

	const FRotator View = GetController() ? GetController()->GetControlRotation() : GetActorRotation();
	TeleportToLocation(Target, View, false);
	if (!Reason.IsEmpty())
	{
		ShowToast(Reason);
	}
}

void AGibraltarCharacter::FellOutOfWorld(const UDamageType& DmgType)
{
	// Never destroy the player: put them back somewhere sensible instead.
	UE_LOG(LogGibraltar, Warning, TEXT("Player fell out of the world at %s; rescuing."), *GetActorLocation().ToString());
	RescueToGround(NSLOCTEXT("Gibraltar", "FellOut", "You slipped out of the world. Back on solid ground."));
}

void AGibraltarCharacter::UpdateSafety(float DeltaSeconds)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	UCharacterMovementComponent* Move = GetCharacterMovement();

	if (bWaitingForGround)
	{
		WaitForGroundTime += DeltaSeconds;
		const FVector Here = GetActorLocation();
		FCollisionQueryParams Params(SCENE_QUERY_STAT(GibraltarGroundWait), true, this);
		FHitResult Hit;
		const bool bGround = World->LineTraceSingleByChannel(Hit, Here, Here - FVector(0.0, 0.0, 5000.0), ECC_Pawn, Params);
		if (bGround || WaitForGroundTime > 8.f)
		{
			bWaitingForGround = false;
			Move->SetMovementMode(MOVE_Falling);
			ResetCameraSmoothing();
		}
		return;
	}

	const FVector Location = GetActorLocation();

	// Far below the sea floor: something went wrong.
	if (Location.Z < -5000.0)
	{
		RescueToGround(NSLOCTEXT("Gibraltar", "TooLow", "You fell through the world. Back on solid ground."));
		return;
	}

	if (Move->IsMovingOnGround())
	{
		const double FeetZ = Location.Z - GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
		if (FeetZ > 10.0)
		{
			LastSafeLocation = Location;
			bHasSafeLocation = true;
		}
		else if (FeetZ < -25.0 && bHasSafeLocation && FVector::Dist2D(Location, LastSafeLocation) > MaxWadeDistance)
		{
			// The import script puts an invisible floor ~60 cm under the sea so you can
			// paddle along the shore; wading far out sends you back to the beach.
			const FRotator View = GetController() ? GetController()->GetControlRotation() : GetActorRotation();
			const FVector Back = LastSafeLocation;
			TeleportToLocation(Back, View, false);
			LastSafeLocation = Back;
			bHasSafeLocation = true;
			ShowToast(NSLOCTEXT("Gibraltar", "TooDeep", "The water gets too deep. You head back to the shore."));
		}
	}
}
