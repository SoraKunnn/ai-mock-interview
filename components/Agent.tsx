"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

enum CallStatus {
    INACTIVE = "INACTIVE",
    CONNECTING = "CONNECTING",
    ACTIVE = "ACTIVE",
    FINISHED = "FINISHED",
}

interface SavedMessage {
    role: "user" | "system" | "assistant";
    content: string;
}

const Agent = ({
                   userName,
                   userId,
                   interviewId,
                   feedbackId,
                   type,
                   questions,
               }: AgentProps) => {
    const router = useRouter();
    const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
    const [messages, setMessages] = useState<SavedMessage[]>([]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [lastMessage, setLastMessage] = useState<string>("");

    useEffect(() => {
        const onCallStart = () => {
            setCallStatus(CallStatus.ACTIVE);
        };

        const onCallEnd = () => {
            setCallStatus(CallStatus.FINISHED);
        };

        const onMessage = (message: Message) => {
            if (message.type === "transcript" && message.transcriptType === "final") {
                const newMessage = { role: message.role, content: message.transcript };
                setMessages((prev) => [...prev, newMessage]);
            }
        };

        const onSpeechStart = () => {
            console.log("speech start");
            setIsSpeaking(true);
        };

        const onSpeechEnd = () => {
            console.log("speech end");
            setIsSpeaking(false);
        };

        const onError = (error: Error) => {
            console.log("Error:", error);
        };

        vapi.on("call-start", onCallStart);
        vapi.on("call-end", onCallEnd);
        vapi.on("message", onMessage);
        vapi.on("speech-start", onSpeechStart);
        vapi.on("speech-end", onSpeechEnd);
        vapi.on("error", onError);

        return () => {
            vapi.off("call-start", onCallStart);
            vapi.off("call-end", onCallEnd);
            vapi.off("message", onMessage);
            vapi.off("speech-start", onSpeechStart);
            vapi.off("speech-end", onSpeechEnd);
            vapi.off("error", onError);
        };
    }, []);

    useEffect(() => {
        if (messages.length > 0) {
            setLastMessage(messages[messages.length - 1].content);
        }

        const handleGenerateFeedback = async (messages: SavedMessage[]) => {
            console.log("handleGenerateFeedback");

            const { success, feedbackId: id } = await createFeedback({
                interviewId: interviewId!,
                userId: userId!,
                transcript: messages,
                feedbackId,
            });

            if (success && id) {
                router.push(`/interview/${interviewId}/feedback`);
            } else {
                console.log("Error saving feedback");
                router.push("/");
            }
        };

        const saveInterviewToDatabase = async () => {
            try {
                // Extract interview data from messages
                const interviewData = {
                    role: "",
                    level: "",
                    type: "",
                    techstack: [] as string[],
                    questions: [] as string[],
                    userId: userId,
                    finalized: true,
                    createdAt: new Date().toISOString(),
                };

                // Parse messages to extract interview details
                for (const message of messages) {
                    const content = message.content;

                    // Try to extract role, level, type, techstack, and questions
                    if (content.includes("role:") || content.includes("Role:")) {
                        const roleMatch = content.match(/[Rr]ole:\s*([^,\n]+)/);
                        if (roleMatch && roleMatch[1]) {
                            interviewData.role = roleMatch[1].trim();
                        }
                    }

                    if (content.includes("level:") || content.includes("Level:")) {
                        const levelMatch = content.match(/[Ll]evel:\s*([^,\n]+)/);
                        if (levelMatch && levelMatch[1]) {
                            interviewData.level = levelMatch[1].trim();
                        }
                    }

                    if (content.includes("type:") || content.includes("Type:")) {
                        const typeMatch = content.match(/[Tt]ype:\s*([^,\n]+)/);
                        if (typeMatch && typeMatch[1]) {
                            interviewData.type = typeMatch[1].trim();
                        }
                    }

                    if (content.includes("tech stack:") || content.includes("Tech stack:")) {
                        const techMatch = content.match(/[Tt]ech stack:\s*([^,\n]+)/);
                        if (techMatch && techMatch[1]) {
                            interviewData.techstack = techMatch[1].split(',').map(item => item.trim());
                        }
                    }

                    // Extract questions (assuming they're in a list format)
                    if (content.includes("1.") || content.includes("- ")) {
                        const questionLines = content.split('\n').filter(line => 
                            line.trim().match(/^(\d+\.|\-)\s+.+/)
                        );

                        if (questionLines.length > 0) {
                            interviewData.questions = questionLines.map(line => {
                                // Remove the number/bullet and trim
                                return line.replace(/^(\d+\.|\-)\s+/, '').trim();
                            });
                        }
                    }
                }

                // Set defaults if we couldn't extract the data
                if (!interviewData.role) interviewData.role = "Software Developer";
                if (!interviewData.level) interviewData.level = "All-level";
                if (!interviewData.type) interviewData.type = "Mixed";
                if (interviewData.techstack.length === 0) interviewData.techstack = ["JavaScript, React.js, node.js, mongodb,express"];

                // Ensure we have at least some questions
                if (interviewData.questions.length === 0) {
                    // Extract any sentences that might be questions
                    const possibleQuestions = messages
                        .filter(msg => msg.role === "assistant")
                        .flatMap(msg => msg.content.split('\n'))
                        .filter(line => line.trim().endsWith('?'));

                    if (possibleQuestions.length > 0) {
                        interviewData.questions = possibleQuestions;
                    } else {
                        interviewData.questions = ["Tell me about yourself?"];
                    }
                }

                // Save to database
                const response = await fetch('/api/vapi/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        role: interviewData.role,
                        level: interviewData.level,
                        type: interviewData.type,
                        techstack: interviewData.techstack.join(','),
                        amount: interviewData.questions.length,
                        userid: interviewData.userId,
                    }),
                });

                const data = await response.json();

                if (data.success) {
                    console.log("Interview saved successfully");
                } else {
                    console.error("Error saving interview:", data.error);
                }

                router.push("/");
            } catch (error) {
                console.error("Error saving interview:", error);
                router.push("/");
            }
        };

        if (callStatus === CallStatus.FINISHED) {
            if (type === "generate") {
                if (messages.length > 0 && userId) {
                    saveInterviewToDatabase();
                } else {
                    router.push("/");
                }
            } else {
                handleGenerateFeedback(messages);
            }
        }
    }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

    const handleCall = async () => {
        setCallStatus(CallStatus.CONNECTING);

        if (type === "generate") {
            // Use type assertion to fix TypeScript error
            await (vapi.start as any)(process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!, {
                variableValues: {
                    username: userName,
                    userid: userId,
                },
            });
        } else {
            let formattedQuestions = "";
            if (questions) {
                formattedQuestions = questions
                    .map((question) => `- ${question}`)
                    .join("\n");
            }
            // Use type assertion to fix TypeScript error
            await (vapi.start as any)(interviewer, {
                variableValues: {
                    questions: formattedQuestions,
                },
            });
        }
    };

    const handleDisconnect = () => {
        setCallStatus(CallStatus.FINISHED);
        vapi.stop();
    };

    return (
        <>
            <div className="call-view">
                {/* AI Interviewer Card */}
                <div className="card-interviewer">
                    <div className="avatar">
                        <Image
                            src="/ai-avatar.png"
                            alt="profile-image"
                            width={65}
                            height={54}
                            className="object-cover"
                        />
                        {isSpeaking && <span className="animate-speak" />}
                    </div>
                    <h3>AI Interviewer</h3>
                </div>

                {/* User Profile Card */}
                <div className="card-border">
                    <div className="card-content">
                        <Image
                            src="/user-avatar.png"
                            alt="profile-image"
                            width={539}
                            height={539}
                            className="rounded-full object-cover size-[120px]"
                        />
                        <h3>{userName}</h3>
                    </div>
                </div>
            </div>

            {messages.length > 0 && (
                <div className="transcript-border">
                    <div className="transcript">
                        <p
                            key={lastMessage}
                            className={cn(
                                "transition-opacity duration-500 opacity-0",
                                "animate-fadeIn opacity-100"
                            )}
                        >
                            {lastMessage}
                        </p>
                    </div>
                </div>
            )}

            <div className="w-full flex justify-center">
                {callStatus !== "ACTIVE" ? (
                    <button className="relative btn-call" onClick={() => handleCall()}>
            <span
                className={cn(
                    "absolute animate-ping rounded-full opacity-75",
                    callStatus !== "CONNECTING" && "hidden"
                )}
            />

                        <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                  ? "Call"
                  : ". . ."}
            </span>
                    </button>
                ) : (
                    <button className="btn-disconnect" onClick={() => handleDisconnect()}>
                        End
                    </button>
                )}
            </div>
        </>
    );
};

export default Agent;
