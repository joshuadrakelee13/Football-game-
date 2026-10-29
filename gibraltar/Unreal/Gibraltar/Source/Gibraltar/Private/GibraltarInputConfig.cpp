// Gibraltar - runtime Enhanced Input setup.

#include "GibraltarInputConfig.h"

#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "InputCoreTypes.h"
#include "EnhancedActionKeyMapping.h"

UInputAction* UGibraltarInputConfig::MakeAction(const TCHAR* Name, bool bAxis2D, bool bTriggerWhenPaused)
{
	UInputAction* Action = NewObject<UInputAction>(this, FName(Name), RF_Transient);
	Action->ValueType = bAxis2D ? EInputActionValueType::Axis2D : EInputActionValueType::Boolean;
	Action->bTriggerWhenPaused = bTriggerWhenPaused;
	return Action;
}

void UGibraltarInputConfig::MapMoveKey(const FKey& Key, bool bSwizzleToY, bool bNegate)
{
	FEnhancedActionKeyMapping& Mapping = MappingContext->MapKey(MoveAction, Key);
	if (bSwizzleToY)
	{
		// A 1D key press arrives on X; YXZ swizzle moves it to Y (forward/back).
		UInputModifierSwizzleAxis* Swizzle = NewObject<UInputModifierSwizzleAxis>(MappingContext);
		Swizzle->Order = EInputAxisSwizzle::YXZ;
		Mapping.Modifiers.Add(Swizzle);
	}
	if (bNegate)
	{
		UInputModifierNegate* Negate = NewObject<UInputModifierNegate>(MappingContext);
		Mapping.Modifiers.Add(Negate);
	}
}

void UGibraltarInputConfig::Build()
{
	if (MappingContext)
	{
		return;
	}

	MappingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_Gibraltar"), RF_Transient);

	MoveAction = MakeAction(TEXT("IA_Move"), true);
	LookAction = MakeAction(TEXT("IA_Look"), true);
	JumpAction = MakeAction(TEXT("IA_Jump"), false);
	RunAction = MakeAction(TEXT("IA_Run"), false);
	CrouchToggleAction = MakeAction(TEXT("IA_CrouchToggle"), false);
	CrouchHoldAction = MakeAction(TEXT("IA_CrouchHold"), false);
	InteractAction = MakeAction(TEXT("IA_Interact"), false);
	PauseMenuAction = MakeAction(TEXT("IA_PauseMenu"), false, /*bTriggerWhenPaused*/ true);
	ToggleLocationAction = MakeAction(TEXT("IA_ToggleLocation"), false, true);
	TimeBackAction = MakeAction(TEXT("IA_TimeBack"), false);
	TimeForwardAction = MakeAction(TEXT("IA_TimeForward"), false);
	TimePauseAction = MakeAction(TEXT("IA_TimePause"), false);

	// Movement: W/S on Y, A/D on X. Arrow keys as an alternative.
	MapMoveKey(EKeys::W, true, false);
	MapMoveKey(EKeys::S, true, true);
	MapMoveKey(EKeys::D, false, false);
	MapMoveKey(EKeys::A, false, true);
	MapMoveKey(EKeys::Up, true, false);
	MapMoveKey(EKeys::Down, true, true);
	MapMoveKey(EKeys::Right, false, false);
	MapMoveKey(EKeys::Left, false, true);

	// Look: raw mouse delta. Scaling, sensitivity and invert-Y are applied in the character.
	MappingContext->MapKey(LookAction, EKeys::Mouse2D);

	MappingContext->MapKey(JumpAction, EKeys::SpaceBar);

	MappingContext->MapKey(RunAction, EKeys::LeftShift);
	MappingContext->MapKey(RunAction, EKeys::RightShift);

	MappingContext->MapKey(CrouchToggleAction, EKeys::C);
	MappingContext->MapKey(CrouchHoldAction, EKeys::LeftControl);

	MappingContext->MapKey(InteractAction, EKeys::E);

	MappingContext->MapKey(PauseMenuAction, EKeys::Escape);
	MappingContext->MapKey(PauseMenuAction, EKeys::P);

	MappingContext->MapKey(ToggleLocationAction, EKeys::F3);

	MappingContext->MapKey(TimeBackAction, EKeys::LeftBracket);
	MappingContext->MapKey(TimeForwardAction, EKeys::RightBracket);
	MappingContext->MapKey(TimePauseAction, EKeys::T);
}
