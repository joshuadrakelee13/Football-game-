// Gibraltar - Enhanced Input actions and mapping context, built in C++ at runtime.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "InputCoreTypes.h"
#include "GibraltarInputConfig.generated.h"

class UInputAction;
class UInputMappingContext;

/**
 * Creates every UInputAction and the single UInputMappingContext with
 * NewObject, so the project needs no input .uasset files.
 *
 *   WASD move, mouse look, Shift run, Space jump, C toggle crouch,
 *   Left Ctrl hold crouch, E interact, Esc/P pause menu, F3 location readout,
 *   [ / ] time -1 h / +1 h, T pause/resume time.
 */
UCLASS()
class GIBRALTAR_API UGibraltarInputConfig : public UObject
{
	GENERATED_BODY()

public:
	/** Build all actions and key mappings. Safe to call more than once. */
	void Build();

	UPROPERTY(Transient) TObjectPtr<UInputMappingContext> MappingContext;

	UPROPERTY(Transient) TObjectPtr<UInputAction> MoveAction;          // Axis2D (X = right, Y = forward)
	UPROPERTY(Transient) TObjectPtr<UInputAction> LookAction;          // Axis2D (mouse delta)
	UPROPERTY(Transient) TObjectPtr<UInputAction> JumpAction;          // Bool
	UPROPERTY(Transient) TObjectPtr<UInputAction> RunAction;           // Bool (hold)
	UPROPERTY(Transient) TObjectPtr<UInputAction> CrouchToggleAction;  // Bool (press)
	UPROPERTY(Transient) TObjectPtr<UInputAction> CrouchHoldAction;    // Bool (hold)
	UPROPERTY(Transient) TObjectPtr<UInputAction> InteractAction;      // Bool (press)
	UPROPERTY(Transient) TObjectPtr<UInputAction> PauseMenuAction;     // Bool (press), works while paused
	UPROPERTY(Transient) TObjectPtr<UInputAction> ToggleLocationAction;// Bool (press)
	UPROPERTY(Transient) TObjectPtr<UInputAction> TimeBackAction;      // Bool (press)
	UPROPERTY(Transient) TObjectPtr<UInputAction> TimeForwardAction;   // Bool (press)
	UPROPERTY(Transient) TObjectPtr<UInputAction> TimePauseAction;     // Bool (press)

private:
	UInputAction* MakeAction(const TCHAR* Name, bool bAxis2D, bool bTriggerWhenPaused = false);
	void MapMoveKey(const FKey& Key, bool bSwizzleToY, bool bNegate);
};
