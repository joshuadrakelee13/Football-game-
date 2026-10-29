// Gibraltar - game instance: owns user settings and save-slot helpers.

#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "GibraltarTypes.h"
#include "GibraltarGameInstance.generated.h"

class UGibraltarSaveGame;

DECLARE_MULTICAST_DELEGATE_OneParam(FOnGibraltarSettingsChanged, const FGibraltarUserSettings& /*NewSettings*/);

UCLASS()
class GIBRALTAR_API UGibraltarGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:
	virtual void Init() override;

	const FGibraltarUserSettings& GetUserSettings() const { return UserSettings; }

	/** Replace settings, notify listeners and (optionally) write the settings slot. */
	void SetUserSettings(const FGibraltarUserSettings& NewSettings, bool bPersist = true);

	/** Broadcast whenever settings change. */
	FOnGibraltarSettingsChanged OnSettingsChanged;

	/** Write a save object to a slot (synchronous). */
	bool WriteSlot(const FString& SlotName, UGibraltarSaveGame* SaveObject) const;

	/** Load a slot, or nullptr if it does not exist / is not ours. */
	UGibraltarSaveGame* ReadSlot(const FString& SlotName) const;

	bool HasSlot(const FString& SlotName) const;

	void DeleteSlot(const FString& SlotName) const;

	/** True once the initial autosave restore has been attempted (only restore once per session). */
	bool bInitialRestoreDone = false;

private:
	UPROPERTY()
	FGibraltarUserSettings UserSettings;
};
