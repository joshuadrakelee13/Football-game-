// Gibraltar - game target.

using UnrealBuildTool;
using System.Collections.Generic;

public class GibraltarTarget : TargetRules
{
	public GibraltarTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Gibraltar");
	}
}
