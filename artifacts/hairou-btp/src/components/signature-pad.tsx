import { useRef, forwardRef, useImperativeHandle } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  getDataUrl: () => string;
  clear: () => void;
}

interface SignaturePadProps {
  label?: string;
  disabled?: boolean;
}

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ label = "Signez ici", disabled = false }, ref) => {
    const sigRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      isEmpty: () => sigRef.current?.isEmpty() ?? true,
      getDataUrl: () => sigRef.current?.getTrimmedCanvas().toDataURL("image/png") ?? "",
      clear: () => sigRef.current?.clear(),
    }));

    return (
      <div className="space-y-2">
        <div className="relative border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="#011638"
            canvasProps={{
              width: 400,
              height: 160,
              className: "w-full touch-none",
              style: { maxHeight: "160px" },
            }}
          />
          <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground pointer-events-none select-none">
            {label}
          </p>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => sigRef.current?.clear()}
            className="rounded-lg text-xs"
          >
            <Eraser className="w-3 h-3 mr-1" />
            Effacer
          </Button>
        )}
      </div>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
export default SignaturePad;
