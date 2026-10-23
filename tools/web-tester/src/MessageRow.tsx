import { useState } from "react";
import type { Message } from "./types";
import { messageTime } from "./util";

const reactions = ["👍", "❤️", "😂", "😮", "😢"];

type Props = {
  message: Message;
  onReply: (message: Message) => void;
  onReact: (message: Message, reactionKey: string) => void;
};

export default function MessageRow({ message, onReply, onReact }: Props) {
  const [showReactions, setShowReactions] = useState(false);

  return (
    <article className={`message-row ${message.mine ? "mine" : "theirs"}`}>
      <div className="bubble">
        {message.replyTo && (
          <div className="reply-quote">
            <strong>{message.replyTo.mine ? "You" : "Reply"}</strong>
            <span>{message.replyTo.text}</span>
          </div>
        )}

        {message.deleted ? (
          <p className="deleted-message">This message was deleted.</p>
        ) : (
          <>
            <Attachment message={message} />
            {message.text && <p className="message-text">{message.text}</p>}
          </>
        )}

        <div className="bubble-meta">
          <span>{message.mine ? "You" : "Them"}</span>
          <span>{messageTime(message.createdAt)}</span>
          {message.reaction && (
            <span className="reaction-pill">{message.reaction}</span>
          )}
        </div>

        <div className="message-actions">
          <button onClick={() => onReply(message)} type="button">
            Reply
          </button>
          <button
            aria-expanded={showReactions}
            onClick={() => setShowReactions((current) => !current)}
            type="button"
          >
            React
          </button>
        </div>

        {showReactions && (
          <div className="reaction-picker">
            {reactions.map((reaction) => (
              <button
                aria-label={`React with ${reaction}`}
                key={reaction}
                onClick={() => {
                  onReact(message, reaction);
                  setShowReactions(false);
                }}
                type="button"
              >
                {reaction}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function Attachment({ message }: { message: Message }) {
  if (!message.kind) return null;
  const url = message.uri;
  const label = message.filename || message.kind;

  if (!url) {
    return (
      <div className="attachment-missing">
        {label} is unavailable. Sign in again if the link expired.
      </div>
    );
  }

  if (message.kind === "image") {
    return (
      <a
        className="image-attachment"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        <img alt={label} loading="lazy" src={url} />
      </a>
    );
  }

  if (message.kind === "video") {
    return (
      <video className="video-attachment" controls preload="metadata" src={url} />
    );
  }

  if (message.kind === "audio") {
    return <audio className="audio-attachment" controls src={url} />;
  }

  return (
    <a className="file-attachment" href={url} rel="noreferrer" target="_blank">
      <span className="file-icon">↧</span>
      <span>
        <strong>{label}</strong>
        <small>{message.mimeType ?? "file"}</small>
      </span>
    </a>
  );
}
