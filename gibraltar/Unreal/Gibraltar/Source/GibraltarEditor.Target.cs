// Gibraltar - editor target.

using UnrealBuildTool;
using System.Collections.Generic;

public class GibraltarEditorTarget : TargetRules
{
	public GibraltarEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Gibraltar");
	}
}
