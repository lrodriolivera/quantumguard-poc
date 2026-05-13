#!/bin/bash
# QuantumGuard AI - Post-production script
# Adds intro, outro and converts to MP4

set -e

VIDEO_DIR="$(dirname "$0")/../videos"
RAW="$VIDEO_DIR/quantumguard-investor-raw.webm"
FINAL="$VIDEO_DIR/quantumguard-demo-investor.mp4"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_LIGHT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

if [ ! -f "$RAW" ]; then
  echo "ERROR: No se encontro $RAW"
  echo "Ejecuta primero: node demo-investor.mjs"
  exit 1
fi

echo "=== QuantumGuard AI - Post-Production ==="
echo ""

# Step 1: Generate intro (5 seconds, dark gradient with text)
echo "[1/4] Generando intro..."
ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1280x720:d=5,format=yuv420p" \
  -vf " \
    drawtext=fontfile=$FONT:text='QuantumGuard AI':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-60:enable='gte(t,0.5)', \
    drawtext=fontfile=$FONT_LIGHT:text='Firmas Digitales Post-Cuanticas':fontcolor=0xaabbff:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+20:enable='gte(t,1.2)', \
    drawtext=fontfile=$FONT_LIGHT:text='NIST FIPS 203 / 204 / 205  |  ML-DSA  |  SLH-DSA  |  ML-KEM':fontcolor=0x8899cc:fontsize=18:x=(w-text_w)/2:y=(h-text_h)/2+70:enable='gte(t,2)', \
    drawtext=fontfile=$FONT_LIGHT:text='postcuantica.io':fontcolor=0x6688ff:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2+130:enable='gte(t,3)', \
    fade=t=in:st=0:d=1,fade=t=out:st=4:d=1 \
  " \
  -c:v libx264 -crf 18 -preset medium -t 5 "$VIDEO_DIR/intro.mp4" 2>/dev/null

# Step 2: Convert raw demo to MP4 with quality boost
echo "[2/4] Convirtiendo demo a MP4..."
ffmpeg -y -i "$RAW" \
  -c:v libx264 -crf 20 -preset medium \
  -vf "scale=1280:720:flags=lanczos" \
  "$VIDEO_DIR/demo-body.mp4" 2>/dev/null

# Step 3: Generate outro (6 seconds)
echo "[3/4] Generando outro..."
ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1280x720:d=6,format=yuv420p" \
  -vf " \
    drawtext=fontfile=$FONT:text='QuantumGuard AI':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-100:enable='gte(t,0.5)', \
    drawtext=fontfile=$FONT_LIGHT:text='2,600+ firmas/seg  |  5,100+ verificaciones/seg':fontcolor=0xaabbff:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2-30:enable='gte(t,1.2)', \
    drawtext=fontfile=$FONT_LIGHT:text='Algoritmos NIST-certified  |  Quantum-resistant  |  50+ anos de validez':fontcolor=0x8899cc:fontsize=18:x=(w-text_w)/2:y=(h-text_h)/2+20:enable='gte(t,2)', \
    drawtext=fontfile=$FONT_LIGHT:text='Caso de validacion: Paraguay Bank — 2.2M clientes':fontcolor=0x66cc88:fontsize=20:x=(w-text_w)/2:y=(h-text_h)/2+80:enable='gte(t,2.8)', \
    drawtext=fontfile=$FONT:text='postcuantica.io':fontcolor=0x6688ff:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+150:enable='gte(t,3.5)', \
    drawtext=fontfile=$FONT_LIGHT:text='info@postcuantica.io':fontcolor=0x8899aa:fontsize=16:x=(w-text_w)/2:y=(h-text_h)/2+200:enable='gte(t,4)', \
    fade=t=in:st=0:d=1,fade=t=out:st=5:d=1 \
  " \
  -c:v libx264 -crf 18 -preset medium -t 6 "$VIDEO_DIR/outro.mp4" 2>/dev/null

# Step 4: Concatenate intro + demo + outro
echo "[4/4] Concatenando video final..."
cat > "$VIDEO_DIR/concat.txt" << EOF
file 'intro.mp4'
file 'demo-body.mp4'
file 'outro.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i "$VIDEO_DIR/concat.txt" \
  -c:v libx264 -crf 20 -preset medium \
  -movflags +faststart \
  "$FINAL" 2>/dev/null

# Cleanup temp files
rm -f "$VIDEO_DIR/intro.mp4" "$VIDEO_DIR/demo-body.mp4" "$VIDEO_DIR/outro.mp4" "$VIDEO_DIR/concat.txt"

DURATION=$(ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FINAL" 2>/dev/null | cut -d. -f1)
SIZE=$(du -h "$FINAL" | cut -f1)

echo ""
echo "=== Video Final ==="
echo "Archivo: $FINAL"
echo "Duracion: ${DURATION}s"
echo "Tamano: $SIZE"
echo "Formato: MP4 (H.264)"
echo "Resolucion: 1280x720"
