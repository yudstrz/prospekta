'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Helper to render inline bold text and key-value titles
 */
function renderInlineRichText(text) {
  if (!text) return null;
  // Parse **bold** markdown tags
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ fontWeight: 700, color: '#0f172a' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Also auto-bold "Title: Description" pattern when at beginning of a point
    if (/^[A-Za-z0-9\s/&—–-]+:\s+/.test(part) && !part.includes('**')) {
      const idx = part.indexOf(':');
      const title = part.slice(0, idx);
      const rest = part.slice(idx);
      return (
        <span key={i}>
          <strong style={{ fontWeight: 700, color: '#0f172a' }}>{title}</strong>
          {rest}
        </span>
      );
    }
    return part;
  });
}

/**
 * Formatted message component supporting multi-line bullet points, numbered lists, and paragraphs
 */
function FormattedChatMessage({ text, isUser, accentColor }) {
  if (isUser) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  }

  // Pre-process: normalize existing inline bullets or numbered items into clean multiline text
  let normalized = text || '';
  
  // Normalize inline bullets like "including: • Item 1 • Item 2" into line breaks
  normalized = normalized.replace(/\s+[•\u2022]\s+/g, '\n• ');
  if (normalized.startsWith('• ') || normalized.startsWith('\u2022 ')) {
    normalized = '\n' + normalized;
  }
  
  // Normalize inline numbered lists like "covers: 1) Item 1; 2) Item 2" into line breaks
  normalized = normalized.replace(/(?:;\s*|\s+)(?=\b\d+\)\s+)/g, '\n');
  normalized = normalized.replace(/\b(\d+)\)\s+/g, (m, digits) => `${digits}. `);

  // Split into structural blocks by double newlines or single newlines
  const blocks = normalized.split(/\n\n+/);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {blocks.map((block, bIdx) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return null;

        // Check if block consists of bullet points
        const isBulletList = lines.length > 0 && lines.every((l) => /^[•\-\*]\s+/.test(l));
        const isNumberList = lines.length > 0 && lines.every((l) => /^\d+[\.\)]\s+/.test(l));

        if (isBulletList) {
          return (
            <div key={bIdx} style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '3px 0' }}>
              {lines.map((line, lIdx) => {
                const content = line.replace(/^[•\-\*]\s+/, '').trim();
                return (
                  <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', paddingLeft: '2px' }}>
                    <span style={{ 
                      color: accentColor || '#0284c7', 
                      fontSize: '15px', 
                      lineHeight: '17px', 
                      fontWeight: 800,
                      userSelect: 'none' 
                    }}>•</span>
                    <div style={{ flex: 1, lineHeight: 1.5, fontSize: '12.5px' }}>
                      {renderInlineRichText(content)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        if (isNumberList) {
          return (
            <div key={bIdx} style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '3px 0' }}>
              {lines.map((line, lIdx) => {
                const match = line.match(/^(\d+)[\.\)]\s+(.*)$/);
                const num = match ? match[1] : (lIdx + 1);
                const content = match ? match[2] : line;
                return (
                  <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', paddingLeft: '2px' }}>
                    <span style={{ 
                      minWidth: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      background: '#f1f5f9', 
                      color: '#0f172a', 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                      border: '1px solid #e2e8f0'
                    }}>
                      {num}
                    </span>
                    <div style={{ flex: 1, lineHeight: 1.5, fontSize: '12.5px' }}>
                      {renderInlineRichText(content)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // Mixed block: could have introductory line followed by bullet points or numbered steps
        return (
          <div key={bIdx} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {lines.map((line, lIdx) => {
              const isBullet = /^[•\-\*]\s+/.test(line);
              const isNumber = /^\d+[\.\)]\s+/.test(line);

              if (isBullet) {
                const content = line.replace(/^[•\-\*]\s+/, '').trim();
                return (
                  <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', paddingLeft: '2px', margin: '2px 0' }}>
                    <span style={{ color: accentColor || '#0284c7', fontSize: '15px', lineHeight: '17px', fontWeight: 800 }}>•</span>
                    <div style={{ flex: 1, lineHeight: 1.5, fontSize: '12.5px' }}>
                      {renderInlineRichText(content)}
                    </div>
                  </div>
                );
              }

              if (isNumber) {
                const match = line.match(/^(\d+)[\.\)]\s+(.*)$/);
                const num = match ? match[1] : (lIdx + 1);
                const content = match ? match[2] : line;
                return (
                  <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', paddingLeft: '2px', margin: '2px 0' }}>
                    <span style={{ 
                      minWidth: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      background: '#f1f5f9', 
                      color: '#0f172a', 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                      border: '1px solid #e2e8f0'
                    }}>
                      {num}
                    </span>
                    <div style={{ flex: 1, lineHeight: 1.5, fontSize: '12.5px' }}>
                      {renderInlineRichText(content)}
                    </div>
                  </div>
                );
              }

              return (
                <div key={lIdx} style={{ lineHeight: 1.55, color: '#1e293b' }}>
                  {renderInlineRichText(line)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function InteractiveDemoChat({
  companyName,
  category,
  address,
  phone,
  operatingHours,
  showcaseItems = [],
  valueProps = [],
  workflowSteps = [],
  aiQuestions = [],
  accentColor = '#2563eb'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: `Hello! I am ${companyName}'s 24/7 Virtual Concierge. How can I assist your inquiry or scope requirements today?`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messageContainerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 150);
    }
  }, [isOpen]);

  // Global event listener to open concierge from anywhere on the page
  useEffect(() => {
    const handleTrigger = () => setIsOpen(true);
    window.addEventListener('open-concierge', handleTrigger);

    const checkHash = () => {
      if (typeof window !== 'undefined' && window.location.hash === '#interactive-demo') {
        setIsOpen(true);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);

    return () => {
      window.removeEventListener('open-concierge', handleTrigger);
      window.removeEventListener('hashchange', checkHash);
    };
  }, []);

  const defaultQuestions = aiQuestions.length > 0 ? aiQuestions : [
    `What services and solutions do you offer?`,
    `How can I schedule an appointment or inquiry?`,
    `What is your operational workflow or process?`,
    `Check operating location & business hours`
  ];

  const buildRuleBasedReply = (query) => {
    const lower = query.toLowerCase();
    const serviceTitles = showcaseItems
      .map((s) => s?.title)
      .filter(Boolean)
      .slice(0, 4);
    const serviceListText = serviceTitles.length > 0
      ? serviceTitles.join(', ')
      : `specialized ${category || 'commercial'} solutions`;

    const contactPhrase = phone
      ? `call or WhatsApp our direct line at ${phone}`
      : `reach out to our desk at ${address || 'our Singapore office'}`;

    // 1. Scheduling / Appointment / Booking / Consultation
    if (/schedule|book|appoint|reserv|consult|visit|meet|jadwal|janji/i.test(lower)) {
      return `To schedule an appointment or consultation with ${companyName}, you can ${contactPhrase}.\n\n• **Facility Location**: ${address || 'Singapore'}\n• **Operating Hours**: ${operatingHours || 'Monday to Friday, 09:00 - 18:00'}\n• **Key Specialities**: ${serviceTitles.slice(0, 3).join(', ') || 'Consultation & service delivery'}\n\nJust share your preferred date and requirements, and our team will confirm your slot.`;
    }

    // 2. Process / Workflow / Maintenance / How it works / Step / Turnaround
    if (/process|workflow|how do|how does|step|procedure|prosedur|cara|mainten|inspect|standard|turnaround|timeline|durasi/i.test(lower)) {
      if (workflowSteps && workflowSteps.length > 0) {
        const stepsList = workflowSteps
          .slice(0, 4)
          .map((st, idx) => `${idx + 1}. **${st.title}**${st.desc ? `: ${st.desc.replace(/\.$/, '')}` : ''}`)
          .join('\n');
        return `At ${companyName}, our structured operational workflow covers:\n\n${stepsList}\n\nIf you have a specific project timeline or turnaround requirement, you can ${contactPhrase} for an immediate operational assessment.`;
      }
      if (valueProps && valueProps.length > 0) {
        const vpList = valueProps
          .slice(0, 3)
          .map((v) => `• **${v.title}**: ${v.desc}`)
          .join('\n');
        return `Our operational standards at ${companyName} are built on core pillars:\n\n${vpList}\n\nFeel free to ${contactPhrase} to discuss your requirements.`;
      }
      return `Our workflow at ${companyName} starts with an initial requirements assessment, followed by a transparent scope and quotation, execution by our ${category || 'specialist'} team, and final quality verification.`;
    }

    // 3. Specialized / Engineering / Technical / Custom / Capability match
    if (/special|engineer|custom|technic|solut|capabilit|equip|certif|quality|why/i.test(lower)) {
      const stopWords = new Set(['provide', 'services', 'service', 'solutions', 'solution', 'vehicles', 'vehicle', 'company', 'business', 'general']);
      let matchedItem = null;
      let bestScore = 0;
      for (const item of showcaseItems) {
        const words = `${item.title} ${item.desc || ''}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !stopWords.has(w));
        const score = words.filter((w) => lower.includes(w)).length;
        if (score > bestScore) {
          bestScore = score;
          matchedItem = item;
        }
      }
      if (!matchedItem && showcaseItems.length > 0) {
        matchedItem = showcaseItems[showcaseItems.length - 1];
      }

      if (matchedItem) {
        const vpExtra = valueProps[0] ? `\n• **Core Standard**: Upholding ${valueProps[0].title} (${valueProps[0].desc.replace(/\.$/, '')}).` : '';
        return `Yes. For specialized requirements, ${companyName} provides:\n\n• **${matchedItem.title}**: ${matchedItem.desc || 'Tailored technical execution aligned with industry standards.'}${vpExtra}\n\nYou can ${contactPhrase} to discuss technical specifications and project parameters.`;
      }
    }

    // 4. Services / Offerings / Products / What types / Menu / Catalog
    if (/service|offer|product|type|what do you|catalog|menu|scope|layanan|produk|paket/i.test(lower)) {
      if (showcaseItems.length > 0) {
        const detailed = showcaseItems
          .slice(0, 4)
          .map((s) => `• **${s.title}**: ${s.desc || 'Professional execution and support.'}`)
          .join('\n');
        return `${companyName} offers a comprehensive range of ${category || 'professional'} solutions:\n\n${detailed}\n\nLet us know which specific solution you need, or ${contactPhrase}.`;
      }
      return `${companyName} specializes in ${category || 'commercial services & solutions'}. Please ${contactPhrase} for our full service catalog and tailored recommendations.`;
    }

    // 5. Location / Hours / Address / Where / Open / Contact / Phone
    if (/hour|open|close|location|address|where|find|direction|lokasi|alamat|jam|phone|contact|call|hubungi/i.test(lower)) {
      return `${companyName} location & contact summary:\n\n• **Operating Base**: ${address || 'Singapore'}\n• **Business Hours**: ${operatingHours || 'Mon - Fri, 09:00 - 18:00'}\n• **Direct Line**: ${phone || 'Contact desk available upon request'}\n\nFor direct assistance or navigation directions, ${contactPhrase}.`;
    }

    // 6. Pricing / Quote / Cost / Rate / Estimate
    if (/quote|pric|rate|cost|estimat|fee|budget|biaya|harga|tarif/i.test(lower)) {
      const bulletSummary = serviceTitles.slice(0, 3).map((st) => `• **${st}**: Customized quotation upon scope assessment`).join('\n');
      return `Quotations at ${companyName} are tailored to your specific requirements and operational parameters:\n\n${bulletSummary}\n\nWe provide transparent, itemized estimates prior to work commencement. Please ${contactPhrase} with your brief to receive an accurate quote.`;
    }

    // 7. Tracking / Order / Status / Delivery
    if (/track|shipment|cargo|order|status|deliver/i.test(lower)) {
      return `Order and service status updates at ${companyName} are managed directly by our operations desk.\n\n• Real-time shipment & cargo tracking\n• Dedicated consignment status updates\n\nPlease ${contactPhrase} with your reference details for a live status check.`;
    }

    // 8. Keyword match against any showcase item or value prop
    const keywordMatch = showcaseItems.find((item) => {
      const tokens = `${item.title} ${item.desc || ''}`.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      return tokens.some((tk) => lower.includes(tk));
    });
    if (keywordMatch) {
      return `Regarding **${keywordMatch.title}**:\n\n• ${keywordMatch.desc || `This is one of our core offerings at ${companyName}.`}\n\nTo proceed or request project specifications, please ${contactPhrase}.`;
    }

    // 9. Smart contextual fallback (uses real services, address, hours, phone)
    return `At ${companyName} (${category || 'Commercial Services'}), we assist clients with:\n\n• **Core Capabilities**: ${serviceListText}\n• **Location**: ${address || 'Singapore'}\n• **Hours**: ${operatingHours || 'Mon-Fri 09:00-18:00'}\n\nFeel free to ask about our specific services, turnaround times, pricing, or ${contactPhrase}.`;
  };

  const handleAsk = (query) => {
    if (!query || !query.trim() || isTyping) return;
    const q = query.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: q }]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const reply = buildRuleBasedReply(q);
      setMessages((prev) => [...prev, { sender: 'ai', text: reply }]);
      setIsTyping(false);
    }, 450);
  };

  return (
    <>
      <style>{`
        @keyframes conciergeSlideIn {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .concierge-floating-window {
          animation: conciergeSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .concierge-floating-button {
          box-shadow: 0 8px 24px -4px ${accentColor}60, 0 4px 12px rgba(0,0,0,0.15);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .concierge-floating-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 26px -2px ${accentColor}75, 0 6px 14px rgba(0,0,0,0.2);
        }
      `}</style>

      {/* Floating Corner Chatbot Launcher & Popup */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none'
      }}>
        
        {/* Expanded Floating Chatbot Window */}
        {isOpen && (
          <div 
            className="concierge-floating-window"
            style={{
              pointerEvents: 'auto',
              width: '380px',
              maxWidth: 'calc(100vw - 32px)',
              height: '540px',
              maxHeight: 'calc(100vh - 110px)',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 48px -10px rgba(15, 23, 42, 0.25), 0 0 1px rgba(15, 23, 42, 0.15)',
              overflow: 'hidden',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              textAlign: 'left'
            }}
          >
            {/* Header */}
            <div style={{
              background: '#0f172a',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981'
                }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                    {companyName} Concierge
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    24/7 Agentic AI &bull; Online
                  </div>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  background: '#1e293b',
                  color: '#38bdf8',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  letterSpacing: '0.04em'
                }}>
                  DEMO
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Concierge"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.15s ease'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Message Area */}
            <div
              ref={messageContainerRef}
              style={{
                flex: 1,
                padding: '16px',
                overflowY: 'auto',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '88%',
                    padding: '11px 15px',
                    borderRadius: m.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: m.sender === 'user' ? (accentColor || '#0284c7') : '#ffffff',
                    color: m.sender === 'user' ? '#ffffff' : '#0f172a',
                    fontSize: '12.5px',
                    lineHeight: 1.55,
                    border: m.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}>
                    <FormattedChatMessage 
                      text={m.text} 
                      isUser={m.sender === 'user'} 
                      accentColor={accentColor} 
                    />
                  </div>
                </div>
              ))}
              {isTyping && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    padding: '7px 12px',
                    borderRadius: '12px',
                    background: '#ffffff',
                    color: '#64748b',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    fontStyle: 'italic',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: accentColor || '#0284c7' }} />
                    Concierge is typing...
                  </div>
                </div>
              )}
            </div>

            {/* Suggested Quick Prompts */}
            <div style={{
              padding: '10px 14px',
              background: '#ffffff',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
                Suggested quick inquiries:
              </div>
              <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                {defaultQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAsk(q)}
                    disabled={isTyping}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#334155',
                      whiteSpace: 'nowrap',
                      cursor: isTyping ? 'default' : 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Input bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk(inputValue);
              }}
              style={{
                padding: '10px 14px',
                background: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                gap: '8px'
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about services, turnaround, or quotes..."
                disabled={isTyping}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isTyping}
                style={{
                  background: inputValue.trim() && !isTyping ? (accentColor || '#0284c7') : '#94a3b8',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: inputValue.trim() && !isTyping ? 'pointer' : 'default'
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}

        {/* Circular Floating Launcher Button in Bottom-Right Corner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' }}>
          
          {/* Teaser pill on the left (visible when closed) */}
          {!isOpen && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              style={{
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #e2e8f0',
                padding: '9px 16px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 700,
                boxShadow: '0 4px 18px rgba(0,0,0,0.09)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              <span>Ask {companyName} AI</span>
            </button>
          )}

          {/* Round Circle Floating Button */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label={isOpen ? 'Close Concierge Chat' : 'Open Concierge Chat'}
            className="concierge-floating-button"
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              background: accentColor || '#0284c7',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {isOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                {/* Live Online Badge */}
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '13px',
                  height: '13px',
                  background: '#10b981',
                  border: '2.5px solid #ffffff',
                  borderRadius: '50%'
                }} />
              </>
            )}
          </button>
        </div>

      </div>
    </>
  );
}
