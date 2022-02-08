import React from 'react';
import {Path, Svg} from 'react-native-svg';
import {useTheme} from 'styled-components/native';

interface BBackgroundSvgProps {
  isDark: boolean;
}

const BitpayBBackgroundSvg: React.FC<BBackgroundSvgProps> = ({isDark}) => {
  return (
    <Svg width="215" height="250" viewBox="0 0 170 250" fill="none">
      <Path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M90.9668 265.723C100.725 265.723 109.786 263.631 118.15 258.398C126.514 253.862 134.182 247.584 140.455 239.561C146.727 231.885 151.607 222.815 155.091 213.048C158.577 202.932 160.319 192.815 160.319 182.001C160.319 168.745 158.229 158.629 153.699 150.954C149.167 143.279 140.106 140.14 128.258 140.14C124.424 140.14 120.59 140.488 114.316 141.883C108.044 143.279 102.816 146.42 97.5886 150.606L70.7533 264.328C79.1171 265.723 87.8308 265.723 90.9668 265.723ZM144.98 88.5072C158.224 88.5072 169.725 90.9495 179.483 95.834C189.241 100.368 196.909 106.648 203.53 115.02C209.802 123.043 214.332 132.462 217.47 143.276C220.606 154.09 222 165.603 222 178.161C222 197.347 218.516 215.139 211.196 232.233C203.878 248.977 194.469 264.325 182.271 276.534C170.073 289.092 155.784 299.21 139.056 306.186C122.327 313.513 104.553 317 85.3856 317C82.9457 317 78.4139 317 72.142 316.652C65.8682 316.652 58.5503 315.955 50.8826 314.908C42.8668 313.513 34.1532 312.118 25.4413 310.024C16.3796 307.932 8.01577 304.791 0 300.953L71.7939 -0.0975075L135.918 -10.2148L110.477 96.5307C116.053 94.0903 121.281 91.9964 126.858 90.9495C132.782 89.2058 138.706 88.5072 144.98 88.5072Z"
        fill={isDark ? '#0E265C' : '#FCFCFC'}
      />
    </Svg>
  );
};

const BitpayBBackgroundIcon = () => {
  const theme = useTheme();
  return <BitpayBBackgroundSvg isDark={theme.dark} />;
};

export default BitpayBBackgroundIcon;