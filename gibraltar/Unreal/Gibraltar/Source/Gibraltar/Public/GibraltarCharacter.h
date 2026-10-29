// Gibraltar - first-person walker.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GibraltarTypes.h"
#include "GibraltarCharacter.generated.h"

class UCameraComponent;
class UInputComponent;
class UDamageType;
struct FInputActionValue;

/**
 * Real-world proportions: capsule radius 34 cm, half-height 88 cm (1.76 m tall),
 * eye height 1.65 m standing / 1.05 m crouched. Walk 1.4 m/s, run 4.5 m/s.
 * Steps up to 45 cm and slopes up to 50 degrees are walkable; the camera is
 * smoothed over stair steps.
 */
UCLASS()
class GIBRALTAR_API AGibraltarCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AGibraltarCharacter();

	// --- Tunables (cm, cm/s, degrees) ---------------------------------------

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Body")
	float StandingEyeHeightCm = 165.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Body")
	float CrouchedEyeHeightCm = 105.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Movement")
	float WalkSpeed = 140.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Movement")
	float RunSpeed = 450.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Movement")
	float CrouchSpeed = 70.f;

	/** Degrees of rotation per unit of Mouse2D input at sensitivity 1. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Look")
	float BaseLookScale = 1.25f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Interaction")
	float InteractDistance = 300.f;

	/** How fast the camera catches up after a stair step (1/s). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Camera")
	float StairSmoothingSpeed = 14.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Camera")
	float MaxStairOffset = 60.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Camera")
	float CrouchCameraSpeed = 10.f;

	/** Wading further than this from dry land sends you back to the shore (cm). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Gibraltar|Safety")
	float MaxWadeDistance = 2500.f;

	// --- API -------------------------------------------------------------------

	UCameraComponent* GetFirstPersonCamera() const { return FirstPersonCamera; }

	/** True if the player is currently looking at something interactable. */
	bool GetFocusedInteraction(FGibraltarInteractionInfo& OutInfo) const;

	/** Apply FOV / sensitivity / invert-Y. */
	void ApplyUserSettings(const FGibraltarUserSettings& Settings);

	/**
	 * Teleport (e.g. when restoring a save). Movement is frozen until ground is
	 * found below the new location (World Partition may still be streaming).
	 */
	void TeleportToLocation(const FVector& Location, const FRotator& ViewRotation, bool bCrouched = false);

	/** Put the player back on solid ground (fell out of the world, stuck in the sea...). */
	void RescueToGround(const FText& Reason);

	/** Feet height above mean sea level, metres. */
	double GetFeetHeightM() const;

	/** Eye (camera) height above mean sea level, metres. */
	double GetEyeHeightM() const;

	// --- ACharacter / AActor -----------------------------------------------------

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void OnStartCrouch(float HalfHeightAdjust, float ScaledHalfHeightAdjust) override;
	virtual void OnEndCrouch(float HalfHeightAdjust, float ScaledHalfHeightAdjust) override;
	virtual void FellOutOfWorld(const UDamageType& DmgType) override;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gibraltar")
	TObjectPtr<UCameraComponent> FirstPersonCamera;

private:
	// Input handlers
	void HandleMove(const FInputActionValue& Value);
	void HandleLook(const FInputActionValue& Value);
	void HandleJumpStarted();
	void HandleJumpCompleted();
	void HandleRunStarted();
	void HandleRunCompleted();
	void HandleCrouchToggle();
	void HandleCrouchHoldStarted();
	void HandleCrouchHoldCompleted();
	void HandleInteract();

	void UpdateMoveSpeed();
	void UpdateCamera(float DeltaSeconds);
	void UpdateSafety(float DeltaSeconds);
	void UpdateFocus();
	void ResetCameraSmoothing();
	void ShowToast(const FText& Message) const;

	static bool ResolveInteraction(AActor* Actor, FGibraltarInteractionInfo& OutInfo);

	// Look settings
	float LookSensitivity = 1.f;
	bool bInvertLookY = false;

	bool bWantsToRun = false;

	// Camera smoothing state
	float CameraBaseZ = 77.f;
	float StairOffset = 0.f;
	double PrevActorZ = 0.0;
	bool bHavePrevZ = false;
	bool bPrevOnGround = false;

	// Interaction focus
	TWeakObjectPtr<AActor> FocusedActor;
	FGibraltarInteractionInfo FocusedInfo;
	bool bHasFocus = false;

	// Safety / teleport state
	FVector LastSafeLocation = FVector::ZeroVector;
	bool bHasSafeLocation = false;
	bool bWaitingForGround = false;
	float WaitForGroundTime = 0.f;
};
