// Gibraltar - player controller: input setup, pause menu, info panel, saving.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "GibraltarTypes.h"
#include "GibraltarPlayerController.generated.h"

class SWidget;
class UGibraltarInputConfig;
class UGibraltarGameInstance;
class UGibraltarSaveGame;
class AGibraltarSkyController;
class AGibraltarCharacter;

UCLASS()
class GIBRALTAR_API AGibraltarPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AGibraltarPlayerController();

	/** Seconds between autosaves. */
	UPROPERTY(EditDefaultsOnly, Category = "Gibraltar|Save")
	float AutosaveInterval = 60.f;

	/** Input actions/mapping context (created on first use). */
	UGibraltarInputConfig* GetInputConfig();

	// --- Pause menu -------------------------------------------------------------
	void OpenPauseMenu();
	void ClosePauseMenu();
	bool IsPauseMenuOpen() const { return PauseMenuWidget.IsValid(); }

	// --- Landmark info panel ----------------------------------------------------
	void OpenInfoPanel(const FGibraltarInteractionInfo& Info);
	void CloseInfoPanel();
	bool IsInfoPanelOpen() const { return InfoPanelWidget.IsValid(); }

	// --- Messages ---------------------------------------------------------------
	/** Short message at the top of the screen (works while paused). */
	void ShowToast(const FText& Message, float Seconds = 3.f);
	/** Current toast and its opacity (0 when none). */
	bool GetToast(FText& OutMessage, float& OutOpacity) const;

	// --- Save / load ------------------------------------------------------------
	bool SavePosition(const FString& SlotName, bool bNotify);
	bool LoadPosition(const FString& SlotName, bool bNotify);
	void ReturnToStart();
	void QuitToDesktop();

	// --- Misc -------------------------------------------------------------------
	bool IsLocationReadoutVisible() const;
	AGibraltarSkyController* GetSkyController();
	UGibraltarGameInstance* GetGibraltarGameInstance() const;

	virtual void PlayerTick(float DeltaTime) override;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void SetupInputComponent() override;
	virtual void OnPossess(APawn* InPawn) override;

private:
	void HandlePauseMenu();
	void HandleToggleLocation();
	void HandleTimeBack();
	void HandleTimeForward();
	void HandleTimePause();

	void HandleSettingsChanged(const FGibraltarUserSettings& NewSettings);
	void ApplySettingsToWorld();
	void Autosave();
	void RestoreInitialState();
	bool ApplySaveToWorld(const UGibraltarSaveGame* Save, bool bApplyTime);
	void ShowTimeToast();

	UPROPERTY(Transient)
	TObjectPtr<UGibraltarInputConfig> InputConfig;

	TSharedPtr<SWidget> PauseMenuWidget;
	TSharedPtr<SWidget> InfoPanelWidget;
	FVector InfoPanelOpenedAt = FVector::ZeroVector;

	FTimerHandle AutosaveTimer;
	FDelegateHandle SettingsChangedHandle;
	TWeakObjectPtr<AGibraltarSkyController> SkyController;

	FText ToastText;
	double ToastStartTime = 0.0;
	double ToastEndTime = 0.0;
};
