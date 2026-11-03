using System.Collections.Generic;
using System.Linq;
using FCE.Core;
using FCE.Core.Content;

namespace FCE.Sim
{
    /// <summary>
    /// A sensible free-to-play player: collects everything, never spends Club Credits (except the free finish in a
    /// project's last seconds), and spends cash in this order:
    ///   1. the next Clubhouse level;
    ///   2. buildings the next Clubhouse level requires;
    ///   3. new or upgraded producers with the quickest payback;
    ///   4. any other upgrade, cheapest first, but never using money that the next Clubhouse level is waiting for.
    /// </summary>
    sealed class Bot
    {
        readonly Game _game;

        public Bot(Game game) { _game = game; }

        public int ActionsTaken { get; private set; }

        public void PlayTurn()
        {
            _game.CollectAll();
            FinishFreeProjects();
            while (TryOneAction()) ActionsTaken++;
        }

        void FinishFreeProjects()
        {
            foreach (var b in _game.Buildings.ToList())
                if (b.IsUnderConstruction && _game.FinishNowCost(b.Id) == 0) _game.FinishNow(b.Id);
        }

        bool TryOneAction()
        {
            if (_game.FreeCrews < 1) return false;
            var content = _game.Content;
            var hq = _game.Buildings.First(b => b.Def == content.Headquarters.Id);

            // 1. Clubhouse.
            var hqQuote = _game.QuoteUpgrade(hq.Id);
            if (hqQuote.CanStart) return _game.StartUpgrade(hq.Id).Ok;

            // What the next Clubhouse level is waiting on, if anything.
            long reserve = 0;
            var neededFor = new HashSet<string>();
            if (!hqQuote.IsMaxLevel && !hq.IsUnderConstruction)
            {
                foreach (var req in hqQuote.NextLevel.Requirements)
                    if (HighestLevel(req.Building) < req.Level) neededFor.Add(req.Building);
                if (neededFor.Count == 0) reserve = hqQuote.NextLevel.Cost;
            }

            var options = new List<Option>();
            foreach (var b in _game.Buildings)
            {
                var q = _game.QuoteUpgrade(b.Id);
                if (q.CanStart) options.Add(new Option(q, b.Id, null));
            }
            foreach (var def in content.BuildingOrder)
            {
                var q = _game.QuoteNew(def.Id);
                if (q.CanStart) options.Add(new Option(q, 0, def.Id));
            }
            if (options.Count == 0) return false;

            // 2. Requirements for the next Clubhouse level.
            var required = options.Where(o => neededFor.Contains(o.Quote.Def.Id)).OrderBy(o => o.Quote.NextLevel.Cost).FirstOrDefault();
            if (required != null) return Take(required);

            // 3. Producers by payback: earning more is how the club afford everything else.
            var producer = options.Where(o => o.Quote.PaybackSeconds.HasValue).OrderBy(o => o.Quote.PaybackSeconds.Value).FirstOrDefault();
            if (producer != null) return Take(producer);

            // 4. Everything else, without touching money the Clubhouse needs.
            long cash = _game.Balance(Currencies.Cash);
            var other = options.Where(o => cash - o.Quote.NextLevel.Cost >= reserve).OrderBy(o => o.Quote.NextLevel.Cost).FirstOrDefault();
            return other != null && Take(other);
        }

        bool Take(Option o)
        {
            if (o.NewDef == null) return _game.StartUpgrade(o.BuildingId).Ok;
            var spot = _game.FindPlacement(o.NewDef);
            return spot.HasValue && _game.PlaceBuilding(o.NewDef, spot.Value.x, spot.Value.y).Ok;
        }

        int HighestLevel(string def) => _game.Buildings.Where(b => b.Def == def).Select(b => b.Level).DefaultIfEmpty(0).Max();

        sealed class Option
        {
            public Option(UpgradeQuote quote, int buildingId, string newDef) { Quote = quote; BuildingId = buildingId; NewDef = newDef; }
            public UpgradeQuote Quote { get; }
            public int BuildingId { get; }
            public string NewDef { get; }
        }
    }
}
