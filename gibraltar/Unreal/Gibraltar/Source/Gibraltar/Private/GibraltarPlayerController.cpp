// Gibraltar - player controller.

#include "GibraltarPlayerController.h"
#include "Gibraltar.h"
#include "GibraltarCharacter.h"
#include "GibraltarGameInstance.h"
#include "GibraltarGeo.h"
#include "GibraltarInputConfig.h"
#include "GibraltarSaveGame.h"
#include "GibraltarSkyController.h"
#include "UI/SGibraltarInfoPanel.h"
#include "UI/SGibraltarPauseMenu.h"

#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"
#include "GameFramework/GameModeBase.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "TimerManager.h"
#include "Framework/Application/SlateApplication.h"
#include "Widgets/SWidget.h"
#include "HAL/PlatformTime.h"

AGibraltarPlayerController::AGibraltarPlayerController()
{
	bShowMouseCursor = false;
	// World Partition: player controllers are streaming sources by default
	// (APlayerController::bEnableStreamingSource), so cells load around the player.
	// Keep ticking (toasts, info panel distance check) while the game is paused.
	PrimaryActorTick.bTickEvenWhenPaused = true;
}

UGibraltarInputConfig* AGibraltarPlayerController::GetInputConfig()
{
	if (!InputConfig)
	{
		InputConfig = NewObject<UGibraltarInputConfig>(this, TEXT("GibraltarInputConfig"), RF_Transient);
		InputConfig->Build();
	}
	return InputConfig;
}

UGibraltarGameInstance* AGibraltarPlayerController::GetGibraltarGameInstance() const
{
	return GetWorld() ? Cast<UGibraltarGameInstance>(GetWorld()->GetGameInstance()) : nullptr;
}

AGibraltarSkyController* AGibraltarPlayerController::GetSkyController()
{
	if (!SkyController.IsValid() && GetWorld())
	{
		for (TActorIterator<AGibraltarSkyController> It(GetWorld()); It; ++It)
		{
			SkyController = *It;
			break;
		}
	}
	return SkyController.Get();
}

// ---------------------------------------------------------------------------
// Lifecycle

void AGibraltarPlayerController::BeginPlay()
{
	Super::BeginPlay();

	if (!IsLocalController())
	{
		return;
	}

	if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		Subsystem->AddMappingContext(GetInputConfig()->MappingContext, 0);
	}
	else
	{
		UE_LOG(LogGibraltar, Error, TEXT("Enhanced Input subsystem missing: is the EnhancedInput plugin enabled?"));
	}

	SetInputMode(FInputModeGameOnly());
	SetShowMouseCursor(false);

	if (UGibraltarGameInstance* GI = GetGibraltarGameInstance())
	{
		SettingsChangedHandle = GI->OnSettingsChanged.AddUObject(this, &AGibraltarPlayerController::HandleSettingsChanged);
	}

	GetWorldTimerManager().SetTimer(AutosaveTimer, this, &AGibraltarPlayerController::Autosave, AutosaveInterval, true);

	// Give the pawn and the sky controller one tick to finish BeginPlay before restoring.
	GetWorldTimerManager().SetTimerForNextTick(this, &AGibraltarPlayerController::RestoreInitialState);
}

void AGibraltarPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (IsLocalController() && (EndPlayReason == EEndPlayReason::Quit || EndPlayReason == EEndPlayReason::EndPlayInEditor))
	{
		Autosave();
	}

	if (UGibraltarGameInstance* GI = GetGibraltarGameInstance())
	{
		GI->OnSettingsChanged.Remove(SettingsChangedHandle);
	}
	GetWorldTimerManager().ClearTimer(AutosaveTimer);

	// Remove any Slate widgets we added to the viewport.
	if (GEngine && GEngine->GameViewport)
	{
		if (PauseMenuWidget.IsValid())
		{
			GEngine->GameViewport->RemoveViewportWidgetContent(PauseMenuWidget.ToSharedRef());
		}
		if (InfoPanelWidget.IsValid())
		{
			GEngine->GameViewport->RemoveViewportWidgetContent(InfoPanelWidget.ToSharedRef());
		}
	}
	PauseMenuWidget.Reset();
	InfoPanelWidget.Reset();

	Super::EndPlay(EndPlayReason);
}

void AGibraltarPlayerController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	ApplySettingsToWorld();
}

void AGibraltarPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(InputComponent);
	if (!Input)
	{
		UE_LOG(LogGibraltar, Error, TEXT("PlayerController InputComponent is not an UEnhancedInputComponent. Check Config/DefaultInput.ini."));
		return;
	}

	UGibraltarInputConfig* Config = GetInputConfig();
	Input->BindAction(Config->PauseMenuAction, ETriggerEvent::Started, this, &AGibraltarPlayerController::HandlePauseMenu);
	Input->BindAction(Config->ToggleLocationAction, ETriggerEvent::Started, this, &AGibraltarPlayerController::HandleToggleLocation);
	Input->BindAction(Config->TimeBackAction, ETriggerEvent::Started, this, &AGibraltarPlayerController::HandleTimeBack);
	Input->BindAction(Config->TimeForwardAction, ETriggerEvent::Started, this, &AGibraltarPlayerController::HandleTimeForward);
	Input->BindAction(Config->TimePauseAction, ETriggerEvent::Started, this, &AGibraltarPlayerController::HandleTimePause);
}

void AGibraltarPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);

	// Close the info panel once the player has walked away from where it was opened.
	if (InfoPanelWidget.IsValid())
	{
		if (const APawn* P = GetPawn())
		{
			if (FVector::Dist2D(P->GetActorLocation(), InfoPanelOpenedAt) > 800.0)
			{
				CloseInfoPanel();
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Settings

void AGibraltarPlayerController::HandleSettingsChanged(const FGibraltarUserSettings& NewSettings)
{
	ApplySettingsToWorld();
}

void AGibraltarPlayerController::ApplySettingsToWorld()
{
	const UGibraltarGameInstance* GI = GetGibraltarGameInstance();
	if (!GI)
	{
		return;
	}
	const FGibraltarUserSettings& Settings = GI->GetUserSettings();

	if (AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(GetPawn()))
	{
		Walker->ApplyUserSettings(Settings);
	}
	if (AGibraltarSkyController* Sky = GetSkyController())
	{
		Sky->SetTimeSpeed(Settings.TimeSpeed);
	}
}

bool AGibraltarPlayerController::IsLocationReadoutVisible() const
{
	const UGibraltarGameInstance* GI = GetGibraltarGameInstance();
	return GI && GI->GetUserSettings().bShowLocation;
}

void AGibraltarPlayerController::HandleToggleLocation()
{
	if (UGibraltarGameInstance* GI = GetGibraltarGameInstance())
	{
		FGibraltarUserSettings Settings = GI->GetUserSettings();
		Settings.bShowLocation = !Settings.bShowLocation;
		GI->SetUserSettings(Settings, true);
	}
}

// ---------------------------------------------------------------------------
// Time of day keys

void AGibraltarPlayerController::ShowTimeToast()
{
	if (AGibraltarSkyController* Sky = GetSkyController())
	{
		ShowToast(FText::FromString(Sky->GetTimeDescription()), 2.5f);
	}
}

void AGibraltarPlayerController::HandleTimeBack()
{
	if (AGibraltarSkyController* Sky = GetSkyController())
	{
		Sky->ShiftHours(-1.0);
		ShowTimeToast();
	}
}

void AGibraltarPlayerController::HandleTimeForward()
{
	if (AGibraltarSkyController* Sky = GetSkyController())
	{
		Sky->ShiftHours(1.0);
		ShowTimeToast();
	}
}

void AGibraltarPlayerController::HandleTimePause()
{
	if (AGibraltarSkyController* Sky = GetSkyController())
	{
		Sky->SetTimePaused(!Sky->IsTimePaused());
		ShowTimeToast();
	}
}

// ---------------------------------------------------------------------------
// Pause menu

void AGibraltarPlayerController::HandlePauseMenu()
{
	if (IsPauseMenuOpen())
	{
		ClosePauseMenu();
	}
	else if (IsInfoPanelOpen())
	{
		// First Esc closes the info panel, the next one opens the menu.
		CloseInfoPanel();
	}
	else
	{
		OpenPauseMenu();
	}
}

void AGibraltarPlayerController::OpenPauseMenu()
{
	if (IsPauseMenuOpen() || !GEngine || !GEngine->GameViewport)
	{
		return;
	}
	CloseInfoPanel();

	TSharedRef<SGibraltarPauseMenu> Menu = SNew(SGibraltarPauseMenu).OwnerController(this);
	PauseMenuWidget = Menu;
	GEngine->GameViewport->AddViewportWidgetContent(Menu, 100);

	SetPause(true);

	FInputModeUIOnly Mode;
	Mode.SetWidgetToFocus(Menu);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	SetShowMouseCursor(true);
}

void AGibraltarPlayerController::ClosePauseMenu()
{
	if (!IsPauseMenuOpen())
	{
		return;
	}
	if (GEngine && GEngine->GameViewport)
	{
		GEngine->GameViewport->RemoveViewportWidgetContent(PauseMenuWidget.ToSharedRef());
	}
	PauseMenuWidget.Reset();

	SetPause(false);
	SetInputMode(FInputModeGameOnly());
	SetShowMouseCursor(false);
	if (FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().SetAllUserFocusToGameViewport();
	}
}

void AGibraltarPlayerController::QuitToDesktop()
{
	Autosave();
	UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
}

// ---------------------------------------------------------------------------
// Info panel

void AGibraltarPlayerController::OpenInfoPanel(const FGibraltarInteractionInfo& Info)
{
	if (!GEngine || !GEngine->GameViewport)
	{
		return;
	}
	CloseInfoPanel();

	TSharedRef<SGibraltarInfoPanel> Panel = SNew(SGibraltarInfoPanel).Info(Info);
	InfoPanelWidget = Panel;
	GEngine->GameViewport->AddViewportWidgetContent(Panel, 50);
	InfoPanelOpenedAt = GetPawn() ? GetPawn()->GetActorLocation() : FVector::ZeroVector;
}

void AGibraltarPlayerController::CloseInfoPanel()
{
	if (!InfoPanelWidget.IsValid())
	{
		return;
	}
	if (GEngine && GEngine->GameViewport)
	{
		GEngine->GameViewport->RemoveViewportWidgetContent(InfoPanelWidget.ToSharedRef());
	}
	InfoPanelWidget.Reset();
}

// ---------------------------------------------------------------------------
// Toasts

void AGibraltarPlayerController::ShowToast(const FText& Message, float Seconds)
{
	ToastText = Message;
	ToastStartTime = FPlatformTime::Seconds();
	ToastEndTime = ToastStartTime + FMath::Max(0.5f, Seconds);
}

bool AGibraltarPlayerController::GetToast(FText& OutMessage, float& OutOpacity) const
{
	const double Now = FPlatformTime::Seconds();
	if (ToastText.IsEmpty() || Now >= ToastEndTime)
	{
		OutOpacity = 0.f;
		return false;
	}
	OutMessage = ToastText;
	const double FadeIn = FMath::Clamp((Now - ToastStartTime) / 0.2, 0.0, 1.0);
	const double FadeOut = FMath::Clamp((ToastEndTime - Now) / 0.6, 0.0, 1.0);
	OutOpacity = static_cast<float>(FMath::Min(FadeIn, FadeOut));
	return true;
}

// ---------------------------------------------------------------------------
// Save / load

void AGibraltarPlayerController::Autosave()
{
	SavePosition(GibraltarSaveSlots::Autosave, false);
}

bool AGibraltarPlayerController::SavePosition(const FString& SlotName, bool bNotify)
{
	UGibraltarGameInstance* GI = GetGibraltarGameInstance();
	APawn* P = GetPawn();
	if (!GI || !P)
	{
		return false;
	}

	UGibraltarSaveGame* Save = Cast<UGibraltarSaveGame>(UGameplayStatics::CreateSaveGameObject(UGibraltarSaveGame::StaticClass()));
	if (!Save)
	{
		return false;
	}

	Save->SaveVersion = UGibraltarSaveGame::CurrentVersion;
	Save->SavedAtUtc = FDateTime::UtcNow();

	const FVector Location = P->GetActorLocation();
	const FVector Ltm = FGibraltarGeo::UnrealToLtm(Location);
	Save->bHasPlayer = true;
	Save->PlayerLocation = Location;
	Save->PlayerRotation = GetControlRotation();
	FGibraltarGeo::LtmToLonLat(Ltm.X, Ltm.Y, Save->Longitude, Save->Latitude);
	Save->HeightM = Ltm.Z;
	if (const AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(P))
	{
		Save->bWasCrouched = Walker->bIsCrouched;
	}

	if (AGibraltarSkyController* Sky = GetSkyController())
	{
		Save->bHasTime = true;
		Save->SimUtcTicks = Sky->GetSimUtc().GetTicks();
		Save->LocalHourOfDay = static_cast<float>(Sky->GetLocalTime().GetTimeOfDay().GetTotalHours());
		Save->bTimePaused = Sky->IsTimePaused();
	}

	Save->bHasSettings = true;
	Save->Settings = GI->GetUserSettings();

	const bool bOk = GI->WriteSlot(SlotName, Save);
	if (bNotify)
	{
		ShowToast(bOk ? NSLOCTEXT("Gibraltar", "Saved", "Position saved.")
		              : NSLOCTEXT("Gibraltar", "SaveFailed", "Could not save your position."), 2.5f);
	}
	return bOk;
}

bool AGibraltarPlayerController::ApplySaveToWorld(const UGibraltarSaveGame* Save, bool bApplyTime)
{
	if (!Save)
	{
		return false;
	}

	bool bApplied = false;
	if (Save->bHasPlayer)
	{
		if (AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(GetPawn()))
		{
			// Geographic coordinates are the canonical copy; the Unreal location is a cross-check.
			double X = 0.0, Y = 0.0;
			FGibraltarGeo::LonLatToLtm(Save->Longitude, Save->Latitude, X, Y);
			const FVector FromGeo = FGibraltarGeo::LtmToUnreal(FVector(X, Y, Save->HeightM));
			if (FVector::Dist(FromGeo, Save->PlayerLocation) > 100.0)
			{
				UE_LOG(LogGibraltar, Warning, TEXT("Saved Unreal location %s differs from saved lon/lat (%s); using lon/lat."),
					*Save->PlayerLocation.ToString(), *FromGeo.ToString());
			}
			Walker->TeleportToLocation(FromGeo, Save->PlayerRotation, Save->bWasCrouched);
			bApplied = true;
		}
	}

	if (bApplyTime && Save->bHasTime)
	{
		if (AGibraltarSkyController* Sky = GetSkyController())
		{
			Sky->SetSimUtc(FDateTime(Save->SimUtcTicks));
			Sky->SetTimePaused(Save->bTimePaused);
		}
	}
	return bApplied;
}

bool AGibraltarPlayerController::LoadPosition(const FString& SlotName, bool bNotify)
{
	UGibraltarGameInstance* GI = GetGibraltarGameInstance();
	if (!GI)
	{
		return false;
	}

	UGibraltarSaveGame* Save = GI->ReadSlot(SlotName);
	if (!Save && SlotName != GibraltarSaveSlots::Autosave)
	{
		Save = GI->ReadSlot(GibraltarSaveSlots::Autosave);
	}

	const bool bOk = ApplySaveToWorld(Save, true);
	if (bNotify)
	{
		ShowToast(bOk ? NSLOCTEXT("Gibraltar", "Loaded", "Position loaded.")
		              : NSLOCTEXT("Gibraltar", "NoSave", "There is no saved position yet."), 2.5f);
	}
	return bOk;
}

void AGibraltarPlayerController::ReturnToStart()
{
	AGibraltarCharacter* Walker = Cast<AGibraltarCharacter>(GetPawn());
	AGameModeBase* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode() : nullptr;
	if (!Walker || !GameMode)
	{
		return;
	}
	if (AActor* Start = GameMode->FindPlayerStart(this))
	{
		Walker->TeleportToLocation(Start->GetActorLocation(), Start->GetActorRotation(), false);
		ShowToast(NSLOCTEXT("Gibraltar", "BackToStart", "Back at the starting point."), 2.5f);
	}
}

void AGibraltarPlayerController::RestoreInitialState()
{
	ApplySettingsToWorld();

	UGibraltarGameInstance* GI = GetGibraltarGameInstance();
	if (!GI || GI->bInitialRestoreDone)
	{
		return;
	}
	GI->bInitialRestoreDone = true;

	if (UGibraltarSaveGame* Save = GI->ReadSlot(GibraltarSaveSlots::Autosave))
	{
		if (ApplySaveToWorld(Save, true))
		{
			ShowToast(NSLOCTEXT("Gibraltar", "WelcomeBack", "Welcome back. You are where you left off.\n(Pause menu > Return to start to begin again.)"), 6.f);
			return;
		}
	}

	ShowToast(NSLOCTEXT("Gibraltar", "Welcome",
		"Welcome to Gibraltar.  WASD walk, Shift run, Space jump, C crouch, E read signs, Esc/P menu, F3 location."), 8.f);
}
