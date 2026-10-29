// Gibraltar - runtime gameplay module.
//
// Only engine modules that ship with every UE 5.x install are used. The
// GeoReferencing plugin is enabled in the .uproject (so the import script can
// place an AGeoReferencingSystem actor), but this module deliberately does not
// link against it: GIB-LTM <-> lon/lat is implemented in FGibraltarGeo.

using UnrealBuildTool;

public class Gibraltar : ModuleRules
{
	public Gibraltar(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore"
		});
	}
}
