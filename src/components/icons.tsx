import {
  LucideProps,
  Moon,
  SunMedium,
  type Icon as LucideIcon,
} from "lucide-react"

// 使用我们之前创建的 SVG 作为 Logo
const LogoIcon = (props: LucideProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    {...props}
    className="h-6 w-6"
  >
    <path
      fill="currentColor"
      d="M216.38,136.24a87.78,87.78,0,0,1-80.14,80.14,88,88,0,1,1,80.14-80.14Z"
      opacity="0.2"
    />
    <path 
      fill="currentColor"
      d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z"
    />
    <path
      fill="currentColor"
      d="M164,100a36,36,0,1,0-36,36,36,36,0,0,0,36-36Zm-36,20a20,20,0,1,1,20-20,20,20,0,0,1-20,20Z"
    />
  </svg>
);


export const Icons = {
  sun: SunMedium,
  moon: Moon,
  logo: LogoIcon,
} 