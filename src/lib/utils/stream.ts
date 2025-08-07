export async function readStreamToString(
  stream: AsyncGenerator<string, void, unknown> | ReadableStream,
): Promise<string> {
  let result = "";

  if ("getReader" in stream) {
    // Handle ReadableStream
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }
  } else {
    // Handle AsyncGenerator
    for await (const chunk of stream) {
      result += chunk;
    }
  }

  return result;
}
