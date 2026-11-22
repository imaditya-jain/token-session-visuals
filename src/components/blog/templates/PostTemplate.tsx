import ClassicTemplate from "./ClassicTemplate";
import EditorialTemplate from "./EditorialTemplate";
import GuideTemplate from "./GuideTemplate";
import MagazineTemplate from "./MagazineTemplate";
import type { TemplateProps } from "./types";
import VisualTemplate from "./VisualTemplate";

/** Renders a post in the layout chosen in the admin. The switch is exhaustive: a new template id won't compile until handled. */
export default function PostTemplate(props: TemplateProps) {
  switch (props.post.template) {
    case "classic":
      return <ClassicTemplate {...props} />;
    case "magazine":
      return <MagazineTemplate {...props} />;
    case "editorial":
      return <EditorialTemplate {...props} />;
    case "visual":
      return <VisualTemplate {...props} />;
    case "guide":
      return <GuideTemplate {...props} />;
  }
}
