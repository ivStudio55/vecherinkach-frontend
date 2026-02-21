export function SunRaysBackground() {
  return (
    <>
      <div className="comic-animated-bg" aria-hidden="true" />
      <div className="comic-animated-overlay" aria-hidden="true" />
      <div className="sunrays-bg" aria-hidden="true">
        <div className="sunrays-rotor sunrays-rotor-main" />
        <div className="sunrays-rotor sunrays-rotor-soft" />
      </div>
    </>
  );
}
