const { CompositionStage, useTweaks, TweaksPanel, TweakToggle, TweakSection, IntroPiece } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{"motionEditor":true}/*EDITMODE-END*/;

function IntroApp(props) {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      <CompositionStage width={props.orientation === 'portrait' ? 1080 : 1920} height={props.orientation === 'portrait' ? 1920 : 1080} scenes={props.scenes} playback={props.playback} bg="#121212">
        <IntroPiece channel={props.channel} title={props.title} performers={props.performers} orientation={props.orientation} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Playback" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.IntroApp = IntroApp;
