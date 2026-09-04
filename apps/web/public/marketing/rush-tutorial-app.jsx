const { CompositionStage } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "en",
  "motionEditor": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const vertical = window.OM_ORIENTATION !== 'horizontal';
  const width = vertical ? 1080 : 1920;
  const height = vertical ? 1920 : 1080;
  return (
    <React.Fragment>
      <CompositionStage width={width} height={height} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg="#0a0a0a">
        <Piece lang={t.lang} vertical={vertical} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Idioma / Language" />
        <TweakRadio label="Idioma" value={t.lang} options={['es', 'en']} onChange={(v) => setTweak('lang', v)} />
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.App = App;
