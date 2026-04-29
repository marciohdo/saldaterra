require('./load-env');
const Anthropic = require('@anthropic-ai/sdk');
const conversation = require('./conversation');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';

async function reply(phone, userText, systemPrompt) {
  conversation.push(phone, 'user', userText);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversation.get(phone),
  });

  const text = response.content[0].text;
  conversation.push(phone, 'assistant', text);

  // #Ok = encerramento — limpa o histórico após registrar a resposta
  if (text.trim() === '#Ok') conversation.clear(phone);

  return text;
}

module.exports = { reply };
