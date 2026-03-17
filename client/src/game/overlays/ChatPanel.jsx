import React from "react";

export function ChatPanel({
  chatOpen,
  toggleChat,
  chatMessages,
  chatInput,
  setChatInput,
  submitChat,
  setChatFocused
}) {
  return (
    <div className={`chat-panel${chatOpen ? "" : " is-collapsed"}`}>
      <div className="chat-header">
        <div className="chat-title">Chat</div>
        <button className="chat-toggle" type="button" onClick={toggleChat}>
          {chatOpen ? "Hide" : "Show"}
        </button>
      </div>
      <div className="chat-messages">
        {chatMessages.map((msg, index) => (
          <div key={`${msg.time}-${index}`} className="chat-line">
            <span className="chat-name">{msg.from}:</span>
            <span className="chat-text">{msg.text}</span>
          </div>
        ))}
      </div>
      {chatOpen ? (
        <form className="chat-input-row" onSubmit={submitChat}>
          <input
            className="chat-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onFocus={() => setChatFocused(true)}
            onBlur={() => setChatFocused(false)}
            placeholder="Type message..."
            maxLength={160}
          />
        </form>
      ) : null}
    </div>
  );
}
