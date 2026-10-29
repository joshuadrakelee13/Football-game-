// Gibraltar - game instance.

#include "GibraltarGameInstance.h"
#include "Gibraltar.h"
#include "GibraltarGeo.h"
#include "GibraltarSaveGame.h"

#include "Kismet/GameplayStatics.h"

void UGibraltarGameInstance::Init()
{
	Super::Init();

	FGibraltarGeo::RunSelfTest();

	if (UGibraltarSaveGame* Saved = ReadSlot(GibraltarSaveSlots::Settings))
	{
		if (Saved->bHasSettings)
		{
			UserSettings = Saved->Settings;
			UE_LOG(LogGibraltar, Log, TEXT("Loaded user settings."));
		}
	}
	UserSettings.Sanitize();
}

void UGibraltarGameInstance::SetUserSettings(const FGibraltarUserSettings& NewSettings, bool bPersist)
{
	UserSettings = NewSettings;
	UserSettings.Sanitize();

	if (bPersist)
	{
		UGibraltarSaveGame* SaveObject = Cast<UGibraltarSaveGame>(UGameplayStatics::CreateSaveGameObject(UGibraltarSaveGame::StaticClass()));
		if (SaveObject)
		{
			SaveObject->SavedAtUtc = FDateTime::UtcNow();
			SaveObject->bHasSettings = true;
			SaveObject->Settings = UserSettings;
			WriteSlot(GibraltarSaveSlots::Settings, SaveObject);
		}
	}

	OnSettingsChanged.Broadcast(UserSettings);
}

bool UGibraltarGameInstance::WriteSlot(const FString& SlotName, UGibraltarSaveGame* SaveObject) const
{
	if (!SaveObject)
	{
		return false;
	}
	const bool bOk = UGameplayStatics::SaveGameToSlot(SaveObject, SlotName, GibraltarSaveSlots::UserIndex);
	if (!bOk)
	{
		UE_LOG(LogGibraltar, Warning, TEXT("Could not write save slot '%s'."), *SlotName);
	}
	return bOk;
}

UGibraltarSaveGame* UGibraltarGameInstance::ReadSlot(const FString& SlotName) const
{
	if (!UGameplayStatics::DoesSaveGameExist(SlotName, GibraltarSaveSlots::UserIndex))
	{
		return nullptr;
	}
	USaveGame* Loaded = UGameplayStatics::LoadGameFromSlot(SlotName, GibraltarSaveSlots::UserIndex);
	UGibraltarSaveGame* Typed = Cast<UGibraltarSaveGame>(Loaded);
	if (!Typed)
	{
		UE_LOG(LogGibraltar, Warning, TEXT("Save slot '%s' exists but could not be read; ignoring it."), *SlotName);
	}
	return Typed;
}

bool UGibraltarGameInstance::HasSlot(const FString& SlotName) const
{
	return UGameplayStatics::DoesSaveGameExist(SlotName, GibraltarSaveSlots::UserIndex);
}

void UGibraltarGameInstance::DeleteSlot(const FString& SlotName) const
{
	if (HasSlot(SlotName))
	{
		UGameplayStatics::DeleteGameInSlot(SlotName, GibraltarSaveSlots::UserIndex);
	}
}
