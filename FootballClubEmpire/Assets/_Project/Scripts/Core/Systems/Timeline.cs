using FCE.Core.State;

namespace FCE.Core.Systems
{
    /// <summary>What happened while the game advanced from one moment to another. Feeds the "while you were away" screen.</summary>
    public sealed class AdvanceReport
    {
        public long From { get; internal set; }
        public long To { get; internal set; }
        public long ElapsedSeconds => To - From;
        public int UpgradesCompleted { get; internal set; }
        public bool ClockRolledBack { get; internal set; }
    }

    /// <summary>
    /// Moves the simulation forward in time, firing every timed event in chronological order.
    /// Between events, continuous processes (production) are ticked up to the event, so a shop that finishes upgrading
    /// halfway through an eight-hour absence earns at its old rate before and its new rate after, exactly as if the
    /// player had watched the whole thing.
    /// </summary>
    internal static class Timeline
    {
        public static AdvanceReport AdvanceTo(GameContext ctx, long target)
        {
            var state = ctx.State;
            var report = new AdvanceReport { From = state.Now };

            // The device clock went backwards (or was wound back). Never rewind: hold at the latest time seen.
            if (target < state.Now)
            {
                report.ClockRolledBack = true;
                ctx.Raise(new ClockRollbackDetected(state.Now, target));
                target = state.Now;
            }

            while (true)
            {
                long? next = ConstructionSystem.NextCompletion(state);
                if (next == null || next.Value > target) break;

                long at = next.Value < state.Now ? state.Now : next.Value;
                ProductionSystem.TickAll(ctx, at);
                state.Now = at;
                int before = CountUpgrading(state);
                ConstructionSystem.CompleteDue(ctx, at);
                report.UpgradesCompleted += before - CountUpgrading(state);
            }

            ProductionSystem.TickAll(ctx, target);
            state.Now = target;
            report.To = target;
            return report;
        }

        static int CountUpgrading(GameState state)
        {
            int n = 0;
            foreach (var b in state.Buildings) if (b.Construction != null) n++;
            return n;
        }
    }
}
