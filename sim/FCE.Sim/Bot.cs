using System.Collections.Generic;
using System.Linq;
using FCE.Core;
using FCE.Core.Content;

namespace FCE.Sim
{
    /// <summary>What the player was doing during a moment of a session.</summary>
    enum Moment
    {
        /// <summary>Bought at least one upgrade or building.</summary>
        Acting,
        /// <summary>Could afford something, but every crew was busy.</summary>
        WaitingForCrews,
        /// <summary>Something was available but not yet affordable.</summary>
        Saving,
        /// <summary>Nothing at all was available: every building at its cap and nothing new to build.</summary>
        NothingToDo,
    }

    /// <summary>
    /// A sensible free-to-play player: collects everything, never spends Club Credits (except the free finish in a
    /// project's last seconds), and spends cash in this order:
    ///   1. the next Stadium level;
    ///   2. buildings the next Stadium level requires;
    ///   3. new or upgraded producers with the quickest payback;
    ///   4. any other upgrade, cheapest first. While saving for the Stadium it still buys anything cheap (under 5% of
    ///      the Stadium's price), as a real player would, and only holds back on the big purchases.
    /// </summary>
    sealed class Bot
    {
        readonly Game _game;

        public Bot(Game game) { _game = game; }

        public int Actions { get; private set; }

        public Moment PlayTurn()
        {
            _game.CollectAll();
            FinishFreeProjects();
            int before = Actions;
            while (TryOneAction()) Actions++;
            return Actions > before ? Moment.Acting : Classify();
        }

        void FinishFreeProjects()
        {
            foreach (var b in _game.Buildings.ToList())
                if (b.IsUnderConstruction && _game.FinishNowCost(b.Id) == 0) _game.FinishNow(b.Id);
        }

        /// <summary>Why nothing was bought just now.</summary>
        Moment Classify()
        {
            var blockers = AllQuotes().Select(q => q.BlockedBy).ToList();
            if (blockers.Contains(Errors.NoFreeCrew)) return Moment.WaitingForCrews;
            if (blockers.Contains(Errors.NotEnoughCurrency) || blockers.Contains(Errors.RequirementNotMet)) return Moment.Saving;
            // Buildings mid-upgrade will offer their next level once done.
            return _game.Buildings.Any(b => b.IsUnderConstruction) ? Moment.WaitingForCrews : Moment.NothingToDo;
        }

        IEnumerable<UpgradeQuote> AllQuotes()
        {
            foreach (var b in _game.Buildings) yield return _game.QuoteUpgrade(b.Id);
            foreach (var def in _game.Content.BuildingOrder)
                if (_game.RemainingAllowance(def.Id) > 0) yield return _game.QuoteNew(def.Id);
        }

        bool TryOneAction()
        {
            var content = _game.Content;
            var stadium = _game.Buildings.First(b => b.Def == content.Headquarters.Id);

            // 1. Stadium.
            var stadiumQuote = _game.QuoteUpgrade(stadium.Id);
            if (stadiumQuote.CanStart) return _game.StartUpgrade(stadium.Id).Ok;

            long reserve = 0;
            var neededFor = new HashSet<string>();
            if (!stadiumQuote.IsMaxLevel && !stadium.IsUnderConstruction)
            {
                foreach (var req in stadiumQuote.NextLevel.Requirements)
                    if (HighestLevel(req.Building) < req.Level) neededFor.Add(req.Building);
                if (neededFor.Count == 0) reserve = stadiumQuote.NextLevel.Cost;
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
                if (q.CanStart && _game.FindPlacement(def.Id).HasValue) options.Add(new Option(q, 0, def.Id));
            }
            if (options.Count == 0) return false;

            // 2. What the next Stadium level is waiting on.
            var required = options.Where(o => neededFor.Contains(o.Quote.Def.Id)).OrderBy(o => o.Quote.NextLevel.Cost).FirstOrDefault();
            if (required != null) return Take(required);

            // 3. Producers by payback: earning more is how the club affords everything else.
            var producer = options.Where(o => o.Quote.PaybackSeconds.HasValue).OrderBy(o => o.Quote.PaybackSeconds.Value).FirstOrDefault();
            if (producer != null) return Take(producer);

            // 4. Everything else: cheap things freely, big things only with money the Stadium is not waiting for.
            long cash = _game.Balance(Currencies.Cash);
            var other = options
                .Where(o => o.Quote.NextLevel.Cost <= reserve / 20 || cash - o.Quote.NextLevel.Cost >= reserve)
                .OrderBy(o => o.Quote.NextLevel.Cost).FirstOrDefault();
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
