'use client';
import { useState } from 'react';

// Facade: pehle sirf thumbnail; click par YouTube iframe load (page speed / Core Web Vitals ke liye)
export default function Trailer({ id, title }) {
  const [play, setPlay] = useState(false);
  return (
    <div className="video">
      {play ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className="video-facade" onClick={() => setPlay(true)} aria-label={`Play ${title}`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={title} loading="lazy" width="480" height="360" />
          <span className="play" aria-hidden="true">▶</span>
        </button>
      )}
    </div>
  );
}
