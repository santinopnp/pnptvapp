const { Card, Button, Badge, Input, Modal } = window.PnptvUiKit;

function mountPhone(id, node, dark = true) {
  ReactDOM.createRoot(document.getElementById(id)).render(
    <IOSDevice dark={dark}>{node}</IOSDevice>
  );
}
function mountBrowser(id, node, url) {
  ReactDOM.createRoot(document.getElementById(id)).render(
    <ChromeWindow width={1400} height={860} url={url}>
      <div style={{ width: '100%', height: '100%', transform: 'translateZ(0)', overflow: 'hidden' }}>{node}</div>
    </ChromeWindow>
  );
}

mountPhone('mount-home', <HomeFeedScreen />);
mountPhone('mount-live-dir', <LiveDirectoryScreen />);
mountPhone('mount-live-player', <LivePlayerScreen />);
mountPhone('mount-profile', <CreatorProfileScreen />);
mountPhone('mount-dm', <DMListScreen />);
mountPhone('mount-chat', <ChatThreadScreen />);
mountPhone('mount-subscribe', <SubscribeScreen />);
mountPhone('mount-onboarding', <OnboardingScreen />);

mountBrowser('mount-web-home', <WebHomeScreen />, 'app.pnptv.live/home');
mountBrowser('mount-studio', <CreatorStudioScreen />, 'studio.pnptv.live/go-live');
mountBrowser('mount-admin', <AdminConsoleScreen />, 'app.pnptv.live/admin/overview');
mountBrowser('mount-shop', <ShopScreen />, 'app.pnptv.live/shop');
