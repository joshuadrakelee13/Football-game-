using System.Collections.Generic;
using FCE.Core.Content;
using FCE.Core.State;

namespace FCE.Core.Save
{
    /// <summary>Saving and loading the club through an <see cref="ISaveStore"/>, falling back past damaged files.</summary>
    public sealed class SaveSystem
    {
        readonly ISaveStore _store;
        readonly ContentDb _content;

        public SaveSystem(ISaveStore store, ContentDb content)
        {
            _store = store;
            _content = content;
        }

        public void Save(GameState state, long now) => _store.Write(SaveSerializer.Serialize(state, now));

        /// <summary>
        /// The newest readable save, or null if there is none (a first launch). Saves that could not be read are
        /// listed in <see cref="LoadResult.Skipped"/> so the game can report them.
        /// </summary>
        public LoadResult Load()
        {
            var skipped = new List<string>();
            foreach (var (source, text) in _store.ReadCandidates())
            {
                try
                {
                    return new LoadResult(SaveSerializer.Deserialize(text, _content), source, skipped);
                }
                catch (SaveException e)
                {
                    skipped.Add($"{source}: {e.Message}");
                }
            }
            return new LoadResult(null, null, skipped);
        }
    }

    public sealed class LoadResult
    {
        public LoadResult(LoadedSave save, string source, List<string> skipped)
        {
            Save = save;
            Source = source;
            Skipped = skipped;
        }

        /// <summary>Null when there was no readable save.</summary>
        public LoadedSave Save { get; }
        /// <summary>"main", "temp" or "backup": which file the club came from.</summary>
        public string Source { get; }
        public IReadOnlyList<string> Skipped { get; }
        public bool Found => Save != null;
    }
}
