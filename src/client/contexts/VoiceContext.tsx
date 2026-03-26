import { createContext, type ReactNode, useContext } from "react";
import { useVoiceChat } from "../hooks/useVoiceChat";

type VoiceState = ReturnType<typeof useVoiceChat>;

const VoiceContext = createContext<VoiceState | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
	const voice = useVoiceChat();
	return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceState {
	const ctx = useContext(VoiceContext);
	if (!ctx) {
		throw new Error("useVoice must be used within VoiceProvider");
	}
	return ctx;
}
