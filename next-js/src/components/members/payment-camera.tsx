"use client";

import { useEffect, useId, useRef, useState } from "react";
import styled from "styled-components";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { CheckoutDialog } from "./checkout-parts";

/** Browser camera capture; native/mobile file capture uses the same image reader afterward. */
export function PaymentCamera({ onCapture, onClose, onChoose }: {
  onCapture: (file: File) => void; onClose: () => void; onChoose: () => void;
}) {
  const id = useId(), video = useRef<HTMLVideoElement>(null), mounted = useRef(true);
  const [ready, setReady] = useState(false), [capturing, setCapturing] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let alive = true, stream: MediaStream | null = null;
    mounted.current = true;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (!alive) { next.getTracks().forEach(track => track.stop()); return; }
      stream = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      if (alive) setReady(true);
    }
    void start().catch(() => {
      stream?.getTracks().forEach(track => track.stop());
      if (alive) setError("The camera is unavailable or access was denied. You can choose a photo from your device instead.");
    });
    return () => { alive = false; mounted.current = false; stream?.getTracks().forEach(track => track.stop()); };
  }, []);
  function capture() {
    const source = video.current;
    if (capturing || !source?.videoWidth || !source.videoHeight) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = source.videoWidth; canvas.height = source.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo unavailable");
      context.drawImage(source, 0, 0);
      canvas.toBlob(blob => {
        if (!mounted.current) return;
        setCapturing(false);
        if (blob) onCapture(new File([blob], "Payment photo.jpg", { type: "image/jpeg" }));
        else setError("The photo could not be captured. Choose an image from your device instead.");
      }, "image/jpeg", 0.9);
    } catch { setCapturing(false); setError("The photo could not be captured. Choose an image from your device instead."); }
  }
  return <>
    <AppLoading active={!ready && !error || capturing} />
    <CheckoutDialog id={`${id}-camera`} title="Take payment photo" open onCancel={onClose} closeLabel="Close camera"
      footer={<><CriteriaDialogButton variant="secondary" onClick={onClose}>Cancel</CriteriaDialogButton>
        {error ? <CriteriaDialogButton onClick={onChoose}>Choose image</CriteriaDialogButton>
          : <CriteriaDialogButton disabled={!ready || capturing} onClick={capture}>Use photo</CriteriaDialogButton>}</>}>
      <CameraView aria-busy={!ready && !error || capturing}>
        <video ref={video} autoPlay muted playsInline hidden={!ready || !!error} aria-label="Camera preview" />
        {error ? <p role="alert">{error}</p> : <p role="status">{ready ? "Keep the complete payment message clear and in focus." : "Allow camera access to take a photo."}</p>}
      </CameraView>
    </CheckoutDialog>
  </>;
}

const CameraView = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  video { inline-size: 100%; max-block-size: calc(100dvh - var(--gh-size-52)); object-fit: contain; }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-reading); line-height: var(--gh-leading-reading); }
`;
