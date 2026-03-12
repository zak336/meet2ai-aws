export default function AvatarLayer() {
  return (
    <div className="background-layer">
      <video
        className="background-video"
        src="/ww.mp4"
        autoPlay
        muted
        loop
        playsInline
        onError={(e) => console.error('Video failed to load:', e)}
        onLoadedData={() => console.log('Video loaded successfully')}
      />
      <div className="background-overlay" />
    </div>
  );
}
