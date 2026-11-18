import makerIcon from "../../../../assets/icons/qymaker.svg";
import playerIcon from "../../../../assets/icons/qyplayer.svg";

interface LogoProps {
  size?: number;
  /** 播放器和制作器用不同的图标 */
  kind?: "player" | "maker";
}

const ICONS = { player: playerIcon, maker: makerIcon } as const;

/** 程序图标，源文件在 assets/icons/，与安装包用的是同一份 */
export function Logo({ size = 64, kind = "player" }: LogoProps) {
  return <img src={ICONS[kind]} width={size} height={size} alt="" />;
}
