export interface AppFooterProps {
  onShowAbout: () => void;
  onShowLicenseNotice: () => void;
}

export const AppFooter = ({
  onShowAbout,
  onShowLicenseNotice,
}: AppFooterProps) => {
  return (
    <div className="grid justify-center p-1 bg-base-200">
      <div>
        <span>&copy; 2024 - The ZMK Contributors</span> -{" "}
        <span>
          conductor studio is a fork of{" "}
          <a
            className="text-primary hover:underline"
            href="https://github.com/zmkfirmware/zmk-studio"
            target="_blank"
            rel="noreferrer"
          >
            ZMK Studio
          </a>
        </span>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowAbout}>
          About ZMK Studio
        </a>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
          License NOTICE
        </a>
      </div>
    </div>
  );
};
